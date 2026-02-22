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

const personaVoiceGuide: Record<string, string> = {
  accel_v1:
    "Fast, sharp, energizing. Uses vivid comparisons and clean provocations. Sounds like a product leader under deadline.",
  inst_realist_v1:
    "Grounded, dry wit, skeptical. Names failure modes in plain words. Sounds like someone who has handled incidents.",
  labor_v1:
    "Human-centered, morally clear, practical. Connects policy to lived consequences. Sounds like a thoughtful organizer-economist.",
  guest_v1:
    "Distinct perspective with personality. Brings at least one surprising angle tied to the source.",
  editor_v1:
    "Host voice: crisp, curious, and slightly playful. Keeps momentum and audience orientation.",
  editor_warm_v1:
    "Host voice: warm, curious, and incisive without grandstanding."
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

const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "because",
  "could",
  "first",
  "from",
  "have",
  "into",
  "just",
  "like",
  "more",
  "most",
  "only",
  "other",
  "over",
  "same",
  "some",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "what",
  "when",
  "which",
  "while",
  "with",
  "would"
]);

function normalizeForCompare(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function looksUnreadable(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length > 95) {
    return true;
  }
  const jargonHits = (
    text.match(
      /\b(99\.9th|percentile|session reconstruction|risk scoring|human-in-the-loop|immutable|attribution headers|auto-approve|escalation)\b/gi
    ) ?? []
  ).length;
  const punctuationDensity = (text.match(/[;:()]/g) ?? []).length;
  return jargonHits >= 3 || punctuationDensity >= 5;
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

function extractFocusKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 5 && !STOPWORDS.has(token))
    .slice(0, 12);
}

function addressesFocus(text: string, focusText?: string): boolean {
  if (!focusText?.trim()) {
    return true;
  }
  const lower = text.toLowerCase();
  if (
    /\b(to your question|you asked|on your point|answering that|to answer)\b/.test(lower)
  ) {
    return true;
  }
  const keywords = extractFocusKeywords(focusText);
  if (keywords.length === 0) {
    return true;
  }
  const matches = keywords.filter((keyword) => lower.includes(keyword)).length;
  return matches >= 1;
}

function leastRecentlySeenSpeaker(
  panelistIds: string[],
  recentEvents: Array<{ speakerId: string; text: string; type: string }>
): string | null {
  const utterances = recentEvents.filter((event) => event.type === "utterance");
  const lastSeen = new Map<string, number>();
  utterances.forEach((event, idx) => {
    lastSeen.set(event.speakerId, idx);
  });

  let chosen: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const speakerId of panelistIds) {
    const idx = lastSeen.get(speakerId);
    if (idx === undefined) {
      return speakerId;
    }
    if (idx < bestScore) {
      bestScore = idx;
      chosen = speakerId;
    }
  }
  return chosen;
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
  spokenSpeakerIds: string[];
  claim: string;
  tensions: string;
  questions: string;
  guestPrompt: string;
  recentEvents: Array<{ speakerId: string; text: string; type: string }>;
  creatorQuestion?: string;
  focusText?: string;
  latestUtterance?: { speakerId: string; text: string };
}) {
  const recentTranscript = input.recentEvents
    .map((event) => `${event.speakerId} (${event.type}): ${event.text}`)
    .join("\n");

  const buildPrompt = (plainRewrite: boolean) => ({
    model: process.env.OPENAI_DEBATE_MODEL || process.env.OPENAI_MODEL,
    system: [
      "You are one panelist in a live roundtable show for a smart public audience.",
      "Sound like a real person, not a whitepaper.",
      "Be witty, concrete, and thought-provoking without becoming a caricature.",
      "No corporate jargon. No policy buzzword stacking.",
      "Output strict JSON only."
    ].join(" "),
    user: [
      `You are speaker: ${input.panelistId}`,
      `Persona: ${personaMap[input.panelistId] ?? "Panelist."}`,
      `Voice: ${personaVoiceGuide[input.panelistId] ?? "Distinct, human, clear."}`,
      `Directive: ${input.directive}`,
      `Moderator: ${input.moderatorId}`,
      `Other panelists: ${input.panelistIds.join(", ")}`,
      `Panelists who have already spoken: ${input.spokenSpeakerIds.join(", ") || "none yet"}`,
      input.creatorQuestion ? `Creator follow-up: ${input.creatorQuestion}` : "",
      input.focusText ? `Moderator intervention to answer now: ${input.focusText}` : "",
      input.latestUtterance
        ? `Latest cast utterance to react to: ${input.latestUtterance.speakerId}: ${input.latestUtterance.text}`
        : "",
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
      "1) 1-2 sentences.",
      "2) 18-55 words total.",
      input.focusText
        ? "3) First, directly answer the moderator intervention."
        : "3) React directly to the latest cast utterance (agree/challenge/refine).",
      "4) Include one concrete consequence or example people can picture.",
      "5) Use plain words: if a smart non-specialist would squint, rewrite.",
      "6) Add one line of personality: wit, analogy, or a sharp question.",
      "7) Avoid repeating your own previous wording.",
      "8) Do not address or quote a panelist who has not spoken yet in this debate.",
      plainRewrite
        ? "9) Rewrite in plainer language. Remove terms like percentile/session reconstruction/risk scoring/human-in-the-loop."
        : ""
    ]
      .filter(Boolean)
      .join("\n"),
    temperature: 0.8,
    maxOutputTokens: 260
  });

  const parsed = await generateJson(
    buildPrompt(false),
    candidateSchema
  );
  const candidateText = parsed.text ?? parsed.utterance ?? parsed.line;
  if (!candidateText) {
    throw new Error("Candidate JSON missing text/utterance/line");
  }

  if (looksUnreadable(candidateText)) {
    const rewrite = await generateJson(
      buildPrompt(true),
      candidateSchema
    );
    const rewritten = rewrite.text ?? rewrite.utterance ?? rewrite.line;
    if (rewritten && !looksUnreadable(rewritten)) {
      return {
        speakerId: input.panelistId,
        text: rewritten,
        tags: rewrite.tags
      };
    }
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
  focusText?: string;
  latestUtterance?: { speakerId: string; text: string };
}) {
  const recentTranscript = input.recentEvents
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
        "Select the best next utterance(s) for coherence, novelty, clarity, and listenability.",
        "Prefer lines that sound like humans in a compelling conversation.",
        "Output strict JSON only."
      ].join(" "),
      user: [
        `Directive: ${input.directive}`,
        `Moderator ID: ${input.moderatorId}`,
        `Panelists: ${input.panelistIds.join(", ")}`,
        input.creatorQuestion ? `Creator follow-up: ${input.creatorQuestion}` : "",
        input.focusText ? `Moderator intervention to prioritize: ${input.focusText}` : "",
        input.latestUtterance
          ? `Latest cast utterance for continuity: ${input.latestUtterance.speakerId}: ${input.latestUtterance.text}`
          : "",
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
        input.focusText
          ? "2) Prefer candidates that directly answer the moderator intervention."
          : "2) Prefer candidates that respond to the latest cast utterance.",
        "3) Prefer non-repetitive, concrete, understandable utterances with personality.",
        "4) Penalize jargon-heavy and overlong lines.",
        "5) Keep moderatorText to 1 sentence if included."
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
  const lastEvent = recentEvents[recentEvents.length - 1];
  const lastModeratorEvent = [...recentEvents]
    .reverse()
    .find((event) => event.type === "moderator");
  const latestUtteranceEvent = [...recentEvents]
    .reverse()
    .find((event) => event.type === "utterance");
  const focusText =
    input.creatorQuestion?.trim() ||
    (lastEvent?.type === "moderator" ? lastModeratorEvent?.text : undefined);
  const latestUtterance = latestUtteranceEvent
    ? { speakerId: latestUtteranceEvent.speakerId, text: latestUtteranceEvent.text }
    : undefined;
  const spokenSpeakerIds = Array.from(
    new Set(
      recentEvents
        .filter((event) => event.type === "utterance")
        .map((event) => event.speakerId)
    )
  );
  const forcedModeratorText = input.creatorQuestion?.trim();

  if (forcedModeratorText) {
    return {
      utterances: [
        {
          speakerId: effectiveModeratorId,
          type: "moderator",
          text: forcedModeratorText
        }
      ],
      tags: [`directive:${input.directive}`, "host_injected"]
    };
  }

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
        spokenSpeakerIds,
        claim: input.episode.parsedClaim,
        tensions: input.episode.parsedTensions,
        questions: input.episode.parsedQuestions,
        guestPrompt: input.episode.guestPrompt,
        recentEvents,
        creatorQuestion: input.creatorQuestion,
        focusText,
        latestUtterance
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

  const focusCandidates = candidates.filter((candidate) =>
    addressesFocus(candidate.text, focusText)
  );
  const effectiveCandidates = focusCandidates.length > 0 ? focusCandidates : candidates;

  const arbiter = await arbitrateCandidates({
    directive: input.directive,
    moderatorId: effectiveModeratorId,
    panelistIds,
    claim: input.episode.parsedClaim,
    tensions: input.episode.parsedTensions,
    questions: input.episode.parsedQuestions,
    recentEvents,
    candidates: effectiveCandidates,
    creatorQuestion: input.creatorQuestion,
    focusText,
    latestUtterance
  });

  const bySpeaker = new Map(effectiveCandidates.map((c) => [c.speakerId, c]));
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
      typeof pick === "number" ? effectiveCandidates[pick - 1]?.speakerId : pick;
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

  // Guardrail: keep speaker diversity high so one/two voices don't dominate turns.
  const targetSpeaker = leastRecentlySeenSpeaker(panelistIds, recentEvents);
  if (targetSpeaker) {
    const alreadyIncluded = pickedUtterances.some(
      (item) => item.type === "utterance" && item.speakerId === targetSpeaker
    );
    if (!alreadyIncluded) {
      const targetCandidate = bySpeaker.get(targetSpeaker);
      if (
        targetCandidate &&
        !isRepeatedBySpeaker(targetCandidate.speakerId, targetCandidate.text, recentEvents)
      ) {
        const utteranceIndexes = pickedUtterances
          .map((item, idx) => ({ item, idx }))
          .filter((x) => x.item.type === "utterance")
          .map((x) => x.idx);
        if (utteranceIndexes.length >= 2) {
          const replaceAt = utteranceIndexes[utteranceIndexes.length - 1];
          pickedUtterances[replaceAt] = {
            speakerId: targetCandidate.speakerId,
            type: "utterance",
            text: targetCandidate.text
          };
        } else {
          pickedUtterances.push({
            speakerId: targetCandidate.speakerId,
            type: "utterance",
            text: targetCandidate.text
          });
        }
      }
    }
  }

  const utteranceOptions = pickedUtterances.filter(
    (item): item is TurnUtterance => item.type === "utterance"
  );
  const priorUtterances = recentEvents.filter((event) => event.type === "utterance");
  const lastSpeaker = priorUtterances[priorUtterances.length - 1]?.speakerId;
  const spokenSet = new Set(priorUtterances.map((event) => event.speakerId));
  const requiredSpeaker = panelistIds.find((id) => !spokenSet.has(id));

  let selected: TurnUtterance | undefined;
  if (requiredSpeaker) {
    selected = utteranceOptions.find((item) => item.speakerId === requiredSpeaker);
    if (!selected) {
      const forced = bySpeaker.get(requiredSpeaker);
      if (forced) {
        selected = {
          speakerId: forced.speakerId,
          type: "utterance",
          text: forced.text
        };
      }
    }
  }
  if (!selected && lastSpeaker) {
    selected = utteranceOptions.find((item) => item.speakerId !== lastSpeaker);
  }
  if (!selected) {
    selected = utteranceOptions[0] ?? pickedUtterances[0];
  }
  if (!selected) {
    throw new Error("No valid utterance selected");
  }

  return {
    utterances: [selected],
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
