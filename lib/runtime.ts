import {
  createEvent,
  getEpisodeWithEvents,
  transaction,
  updateEpisodeStatus
} from "./store";
import type { DebateStepAction } from "./types";
import { z } from "zod";
import { generateJson, llmAvailable, llmDefaultArbiterModel } from "./llm";

const MODERATOR_ID = "editor_v1";
const PREFETCH_MAX_AGE_MS = 45_000;

type EpisodeSnapshot = NonNullable<ReturnType<typeof getEpisodeWithEvents>>;

type TurnUtterance = {
  speakerId: string;
  type: "moderator" | "utterance";
  text: string;
};

type GeneratedTurn = {
  utterances: TurnUtterance[];
  tags: string[];
};

type PrefetchEntry = {
  status: "generating" | "ready";
  turn?: GeneratedTurn;
  createdAt: number;
  promise?: Promise<void>;
};

const prefetchCache = new Map<string, PrefetchEntry>();

const personaMap: Record<string, string> = {
  accel_v1: "Accelerationist: scale, capability compounding, deployment urgency.",
  inst_realist_v1: "Institutional Realist: governance, coordination limits, fragility risks.",
  labor_v1: "Labor Analyst: worker power, inequality, social cohesion, transition costs.",
  guest_v1: "Guest Seat: custom perspective tied to creator prompt.",
  editor_v1: "Moderator: concise, contextual, intervenes only when needed.",
  editor_warm_v1: "Moderator: calm and incisive, protects coherence without over-talking."
};

const candidateSchema = z.object({
  text: z.string().min(16).optional(),
  utterance: z.string().min(16).optional(),
  line: z.string().min(16).optional(),
  tags: z.array(z.string()).max(5).optional().default([])
});

const arbiterSchema = z.object({
  includeModerator: z.boolean(),
  moderatorText: z.string().optional(),
  picks: z.array(z.union([z.string().min(1), z.number().int().min(1)])).min(1).max(2),
  tags: z.array(z.string()).max(8).optional().default([])
});

function normalizeForCompare(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function isRepeatedBySpeaker(
  speakerId: string,
  text: string,
  recentEvents: Array<{ speakerId: string; text: string; type: string }>
): boolean {
  const norm = normalizeForCompare(text);
  const recentSameSpeaker = recentEvents
    .filter((event) => event.type === "utterance" && event.speakerId === speakerId)
    .slice(-3);
  return recentSameSpeaker.some((event) => normalizeForCompare(event.text) === norm);
}

function normalizeDirective(action: DebateStepAction): Exclude<DebateStepAction, "normal"> {
  if (action === "normal") {
    return "auto";
  }
  return action;
}

function clearPrefetch(episodeId: string) {
  prefetchCache.delete(episodeId);
}

function consumePrefetchedTurn(episodeId: string): GeneratedTurn | null {
  const entry = prefetchCache.get(episodeId);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.createdAt > PREFETCH_MAX_AGE_MS) {
    prefetchCache.delete(episodeId);
    return null;
  }
  if (entry.status !== "ready" || !entry.turn) {
    return null;
  }
  prefetchCache.delete(episodeId);
  return entry.turn;
}

async function generateCandidateForSpeaker(input: {
  panelistId: string;
  directive: Exclude<DebateStepAction, "normal">;
  moderatorId: string;
  panelistIds: string[];
  claim: string;
  tensions: string;
  questions: string;
  guestPrompt: string;
  recentEvents: Array<{ speakerId: string; text: string; type: string }>;
  creatorQuestion?: string;
}) {
  const recentTranscript = input.recentEvents
    .slice(-8)
    .map((event) => `${event.speakerId} (${event.type}): ${event.text}`)
    .join("\n");

  const parsed = await generateJson(
    {
      model: process.env.OPENAI_DEBATE_MODEL || process.env.OPENAI_MODEL,
      system: [
        "You are one panelist in a live roundtable.",
        "Write plain-language, concrete, non-caricatural responses.",
        "Avoid slogan-like abstractions.",
        "Output strict JSON only."
      ].join(" "),
      user: [
        `You are speaker: ${input.panelistId}`,
        `Persona: ${personaMap[input.panelistId] ?? "Panelist."}`,
        `Directive: ${input.directive}`,
        `Moderator: ${input.moderatorId}`,
        `Other panelists: ${input.panelistIds.join(", ")}`,
        input.creatorQuestion ? `Creator follow-up: ${input.creatorQuestion}` : "",
        `Claim: ${input.claim}`,
        `Tensions: ${input.tensions}`,
        `Open questions: ${input.questions}`,
        input.guestPrompt ? `Guest prompt: ${input.guestPrompt}` : "",
        "",
        "Recent transcript:",
        recentTranscript || "No prior turns.",
        "",
        "Return JSON:",
        "{ text, tags }",
        "Rules:",
        "1) 1-3 sentences only.",
        "2) React to something specific from the recent context.",
        "3) Include one concrete mechanism, example, or consequence.",
        "4) Do not repeat one of your prior lines verbatim."
      ]
        .filter(Boolean)
        .join("\n"),
      temperature: 0.55,
      maxOutputTokens: 220
    },
    candidateSchema
  );
  const candidateText = parsed.text ?? parsed.utterance ?? parsed.line;
  if (!candidateText) {
    throw new Error("Candidate JSON missing text/utterance/line");
  }
  return {
    speakerId: input.panelistId,
    text: candidateText,
    tags: parsed.tags
  };
}

async function arbitrateCandidates(input: {
  directive: Exclude<DebateStepAction, "normal">;
  moderatorId: string;
  panelistIds: string[];
  claim: string;
  tensions: string;
  questions: string;
  recentEvents: Array<{ speakerId: string; text: string; type: string }>;
  candidates: Array<{ speakerId: string; text: string; tags?: string[] }>;
  creatorQuestion?: string;
}) {
  const recentTranscript = input.recentEvents
    .slice(-8)
    .map((event) => `${event.speakerId} (${event.type}): ${event.text}`)
    .join("\n");
  const candidateText = input.candidates
    .map((c, i) => `${i + 1}. ${c.speakerId}: ${c.text}`)
    .join("\n");

  return generateJson(
    {
      model: llmDefaultArbiterModel,
      system: [
        "You are a fast discussion arbiter.",
        "Select the best next utterance(s) for coherence, novelty, and clarity.",
        "Output strict JSON only."
      ].join(" "),
      user: [
        `Directive: ${input.directive}`,
        `Moderator ID: ${input.moderatorId}`,
        `Panelists: ${input.panelistIds.join(", ")}`,
        input.creatorQuestion ? `Creator follow-up: ${input.creatorQuestion}` : "",
        `Claim: ${input.claim}`,
        `Tensions: ${input.tensions}`,
        `Open questions: ${input.questions}`,
        "",
        "Recent transcript:",
        recentTranscript || "No prior turns.",
        "",
        "Candidate utterances:",
        candidateText,
        "",
        "Return JSON:",
        "{ includeModerator, moderatorText, picks, tags }",
        "Rules:",
        "1) picks must contain 1-2 candidates (speaker IDs or candidate numbers).",
        "2) Include moderator only if needed for clarity/conflict/refocus.",
        "3) Prefer non-repetitive, concrete, understandable utterances.",
        "4) Keep moderatorText to 1 sentence if included."
      ]
        .filter(Boolean)
        .join("\n"),
      temperature: 0.2,
      maxOutputTokens: 180
    },
    arbiterSchema
  );
}

async function generateTurn(input: {
  episode: EpisodeSnapshot;
  directive: Exclude<DebateStepAction, "normal">;
  creatorQuestion?: string;
}): Promise<GeneratedTurn> {
  const panelistIds = input.episode.panelistIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const effectiveModeratorId = input.episode.moderatorId || MODERATOR_ID;
  const speakerTurnCount = input.episode.events.filter(
    (event) => event.type === "utterance"
  ).length;
  const recentEvents = input.episode.events.map((event) => ({
    speakerId: event.speakerId,
    text: event.text,
    type: event.type
  }));

  if (!llmAvailable()) {
    throw new Error("OPENAI_API_KEY is missing for live debate generation");
  }

  const settled = await Promise.allSettled(
    panelistIds.map((panelistId) =>
      generateCandidateForSpeaker({
        panelistId,
        directive: input.directive,
        moderatorId: effectiveModeratorId,
        panelistIds,
        claim: input.episode.parsedClaim,
        tensions: input.episode.parsedTensions,
        questions: input.episode.parsedQuestions,
        guestPrompt: input.episode.guestPrompt,
        recentEvents,
        creatorQuestion: input.creatorQuestion
      })
    )
  );

  const candidates: Array<{ speakerId: string; text: string; tags?: string[] }> = [];
  const candidateErrors: string[] = [];
  settled.forEach((result, index) => {
    const speaker = panelistIds[index] ?? `speaker_${index + 1}`;
    if (result.status === "fulfilled") {
      candidates.push(result.value);
      return;
    }
    const reason =
      result.reason instanceof Error ? result.reason.message : String(result.reason);
    candidateErrors.push(`${speaker}: ${reason}`);
  });

  if (candidates.length === 0) {
    throw new Error(
      `All panelist candidate generations failed. ${candidateErrors.join(" | ")}`
    );
  }

  const arbiter = await arbitrateCandidates({
    directive: input.directive,
    moderatorId: effectiveModeratorId,
    panelistIds,
    claim: input.episode.parsedClaim,
    tensions: input.episode.parsedTensions,
    questions: input.episode.parsedQuestions,
    recentEvents,
    candidates,
    creatorQuestion: input.creatorQuestion
  });

  const bySpeaker = new Map(candidates.map((c) => [c.speakerId, c]));
  const pickedUtterances: TurnUtterance[] = [];

  if (speakerTurnCount === 0 && !arbiter.includeModerator) {
    pickedUtterances.push({
      speakerId: effectiveModeratorId,
      type: "moderator",
      text:
        "Today we’re discussing the source claim and why it matters now. Opening question: which assumption fails first in real operations?"
    });
  } else if (arbiter.includeModerator && arbiter.moderatorText) {
    pickedUtterances.push({
      speakerId: effectiveModeratorId,
      type: "moderator",
      text: arbiter.moderatorText
    });
  }

  for (const pick of arbiter.picks) {
    const speakerId =
      typeof pick === "number" ? candidates[pick - 1]?.speakerId : pick;
    if (!speakerId) {
      continue;
    }
    const candidate = bySpeaker.get(speakerId);
    if (!candidate) {
      continue;
    }
    if (isRepeatedBySpeaker(candidate.speakerId, candidate.text, recentEvents)) {
      continue;
    }
    pickedUtterances.push({
      speakerId: candidate.speakerId,
      type: "utterance",
      text: candidate.text
    });
  }

  if (pickedUtterances.length === 0) {
    const backup = candidates.find(
      (candidate) =>
        !isRepeatedBySpeaker(candidate.speakerId, candidate.text, recentEvents)
    );
    if (backup) {
      pickedUtterances.push({
        speakerId: backup.speakerId,
        type: "utterance",
        text: backup.text
      });
    }
  }

  if (pickedUtterances.length === 0) {
    throw new Error("Arbiter produced only repeated or invalid picks");
  }

  return {
    utterances: pickedUtterances.slice(0, 3),
    tags: [`directive:${input.directive}`, ...(arbiter.tags ?? [])]
  };
}

function schedulePrefetch(episodeId: string) {
  const existing = prefetchCache.get(episodeId);
  if (existing && existing.status === "generating") {
    return;
  }
  const snapshot = getEpisodeWithEvents(episodeId);
  if (!snapshot) {
    return;
  }
  const entry: PrefetchEntry = {
    status: "generating",
    createdAt: Date.now()
  };
  const promise = generateTurn({
    episode: snapshot,
    directive: "auto"
  })
    .then((turn) => {
      prefetchCache.set(episodeId, {
        status: "ready",
        turn,
        createdAt: Date.now()
      });
    })
    .catch(() => {
      prefetchCache.delete(episodeId);
    });
  entry.promise = promise;
  prefetchCache.set(episodeId, entry);
}

export async function runDebateStep(
  episodeId: string,
  action: DebateStepAction,
  creatorQuestion?: string
) {
  const episode = getEpisodeWithEvents(episodeId);
  if (!episode) {
    throw new Error("Episode not found");
  }

  const directive = normalizeDirective(action);
  const canUsePrefetch = directive === "auto" && !creatorQuestion;

  let turn: GeneratedTurn | null = null;
  let usedPrefetch = false;

  if (canUsePrefetch) {
    const prefetched = consumePrefetchedTurn(episodeId);
    if (prefetched) {
      turn = prefetched;
      usedPrefetch = true;
    }
  } else {
    clearPrefetch(episodeId);
  }

  if (!turn) {
    try {
      turn = await generateTurn({
        episode,
        directive,
        creatorQuestion
      });
    } catch (error) {
      throw new Error(
        `Live LLM turn generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  const created = transaction(() => {
    const events = turn.utterances.map((item) =>
      createEvent({
        episodeId,
        type: item.type,
        speakerId: item.speakerId,
        text: item.text,
        tags: turn.tags.join(",")
      })
    );
    updateEpisodeStatus(episodeId, "live");
    return events;
  });

  if (directive === "auto") {
    schedulePrefetch(episodeId);
  }

  return {
    events: created,
    meta: { usedPrefetch }
  };
}
