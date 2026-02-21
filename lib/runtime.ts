import {
  createEvent,
  getEpisodeWithEvents,
  transaction,
  updateEpisodeStatus
} from "./store";
import type { DebateStepAction } from "./types";
import { z } from "zod";
import { generateJson, llmAvailable } from "./llm";

const MODERATOR_ID = "editor_v1";

const speakerTemplates: Record<string, string[]> = {
  accel_v1: [
    "If capability is compounding, waiting is the highest risk move.",
    "The marginal team with better tooling will outrun policy cycles.",
    "The right question is not if this deploys, but who deploys better."
  ],
  inst_realist_v1: [
    "Coordination debt accumulates quietly until one failure makes it obvious.",
    "We keep assuming institutions can absorb this pace; that assumption is weak.",
    "Scale without governance is not speed, it is deferred fragility."
  ],
  labor_v1: [
    "Productivity headlines hide who loses bargaining power first.",
    "If people cannot map a path to relevance, social trust declines fast.",
    "You are pricing upside and externalizing transition pain."
  ],
  guest_v1: [
    "The surprising part is not the model quality, it is workflow redesign lag.",
    "Everyone is arguing models while incentives remain unchanged.",
    "If this is a software factory, who owns quality gates?"
  ]
};

const moderatorTemplates: Record<DebateStepAction, string[]> = {
  normal: [
    "Make the tradeoff explicit and challenge one assumption directly.",
    "Name one thing you agree with, then tell me exactly where it breaks."
  ],
  push_harder: [
    "You just dodged the core claim. Give me a falsifiable statement.",
    "Stop describing. Commit to what happens by next year."
  ],
  get_concrete: [
    "Give a concrete example from an actual team or budget decision.",
    "Translate that into one metric an operator could track."
  ],
  time_check: [
    "We are short on time. One unresolved dispute each.",
    "Compress to final commitments and what would change your mind."
  ],
  creator_followup: [
    "Creator follow-up received. Address it directly before broadening scope.",
    "Answer the creator question in one clear sentence, then defend it."
  ]
};

function pickNextSpeaker(speakers: string[], count: number): string {
  if (speakers.length === 0) {
    return "accel_v1";
  }
  return speakers[count % speakers.length] ?? "accel_v1";
}

function pickDifferentSpeaker(
  speakers: string[],
  excluded: string,
  count: number
): string {
  const filtered = speakers.filter((speaker) => speaker !== excluded);
  if (filtered.length === 0) {
    return excluded;
  }
  return filtered[count % filtered.length] ?? filtered[0];
}

function pickLine(lines: string[], count: number): string {
  if (lines.length === 0) {
    return "I need a more specific claim before I can respond.";
  }
  return lines[count % lines.length] ?? lines[0];
}

const personaMap: Record<string, string> = {
  accel_v1: "Accelerationist: scale, capability compounding, deployment urgency.",
  inst_realist_v1: "Institutional Realist: governance, coordination limits, fragility risks.",
  labor_v1: "Labor Analyst: worker power, inequality, social cohesion, transition costs.",
  guest_v1: "Guest Seat: custom perspective tied to creator prompt.",
  editor_v1: "The Editor moderator: sharp, tempo-driven, forces specificity.",
  editor_warm_v1: "Diplomatic moderator: calm but incisive, protects clarity."
};

const turnSchema = z.object({
  beatType: z.enum(["opening", "clash", "deepen", "commitment", "close"]).optional(),
  moderatorText: z.string().min(12),
  speakerId: z.string().min(1),
  speakerText: z.string().min(16),
  challengerId: z.string().optional(),
  challengerText: z.string().min(10).optional(),
  tags: z.array(z.string()).max(6).optional().default([])
});

async function generateTurnWithLlm(input: {
  action: DebateStepAction;
  claim: string;
  tensions: string;
  questions: string;
  panelistIds: string[];
  moderatorId: string;
  guestPrompt: string;
  recentEvents: Array<{ speakerId: string; text: string; type: string }>;
  creatorQuestion?: string;
}) {
  if (!llmAvailable()) {
    return null;
  }

  const recentTranscript = input.recentEvents
    .slice(-8)
    .map((event) => `${event.speakerId} (${event.type}): ${event.text}`)
    .join("\n");

  const personas = [input.moderatorId, ...input.panelistIds]
    .map((id) => `${id}: ${personaMap[id] ?? "Panel persona"}`)
    .join("\n");

  const llmTurn = await generateJson(
    {
      system: [
        "You generate one high-quality debate beat for a live AI roundtable.",
        "Output strict JSON only.",
        "Make it sharp, substantive, and slightly witty without becoming theatrical.",
        "No generic agreement. Push on assumptions and tradeoffs.",
        "Avoid repeating prior points; advance the argument."
      ].join(" "),
      user: [
        `Action: ${input.action}`,
        `Moderator ID: ${input.moderatorId}`,
        `Allowed speaker IDs: ${input.panelistIds.join(", ")}`,
        input.creatorQuestion ? `Creator follow-up: ${input.creatorQuestion}` : "",
        `Source claim: ${input.claim}`,
        `Source tensions: ${input.tensions}`,
        `Open questions: ${input.questions}`,
        input.guestPrompt ? `Guest prompt: ${input.guestPrompt}` : "",
        "",
        "Persona notes:",
        personas,
        "",
        "Recent transcript:",
        recentTranscript || "No prior turns.",
        "",
        "Return JSON with:",
        "- beatType: one of opening|clash|deepen|commitment|close",
        "- moderatorText: one intervention/question",
        "- speakerId: one allowed panelist id",
        "- speakerText: a concrete response (2-4 sentences) that addresses another viewpoint",
        "- challengerId/challengerText: optional short crossfire rebuttal from a different panelist",
        "- tags: short tags"
      ]
        .filter(Boolean)
        .join("\n"),
      temperature: 0.7
    },
    turnSchema
  );

  return llmTurn;
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

  const panelistIds = episode.panelistIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const speakerTurnCount = episode.events.filter((event) => event.type === "utterance").length;
  const effectiveModeratorId = episode.moderatorId || MODERATOR_ID;
  const moderatorCount = episode.events.filter(
    (event) => event.speakerId === effectiveModeratorId
  ).length;
  let speakerId = pickNextSpeaker(panelistIds, speakerTurnCount);
  let baseText = pickLine(speakerTemplates[speakerId] ?? [], speakerTurnCount);
  let challengerId = pickDifferentSpeaker(panelistIds, speakerId, speakerTurnCount);
  let challengerText = "";
  let moderatorText = pickLine(moderatorTemplates[action], moderatorCount);
  let tags = [`action:${action}`, "beat:clash"];

  try {
    const llmTurn = await generateTurnWithLlm({
      action,
      claim: episode.parsedClaim,
      tensions: episode.parsedTensions,
      questions: episode.parsedQuestions,
      panelistIds,
      moderatorId: episode.moderatorId || MODERATOR_ID,
      guestPrompt: episode.guestPrompt,
      recentEvents: episode.events.map((event) => ({
        speakerId: event.speakerId,
        text: event.text,
        type: event.type
      })),
      creatorQuestion
    });

    if (llmTurn) {
      moderatorText = llmTurn.moderatorText;
      speakerId = panelistIds.includes(llmTurn.speakerId)
        ? llmTurn.speakerId
        : speakerId;
      baseText = llmTurn.speakerText;
      if (
        llmTurn.challengerId &&
        llmTurn.challengerText &&
        panelistIds.includes(llmTurn.challengerId) &&
        llmTurn.challengerId !== speakerId
      ) {
        challengerId = llmTurn.challengerId;
        challengerText = llmTurn.challengerText;
      }
      const llmTags = llmTurn.tags ?? [];
      const beatTag = llmTurn.beatType ? [`beat:${llmTurn.beatType}`] : [];
      if (llmTags.length > 0) {
        tags = [`action:${action}`, ...beatTag, ...llmTags];
      } else if (beatTag.length > 0) {
        tags = [`action:${action}`, ...beatTag];
      }
    }
  } catch {
    // Keep deterministic fallback.
  }

  const created = transaction(() => {
    const moderator = createEvent({
      episodeId,
      type: "moderator",
      speakerId: effectiveModeratorId,
      text: creatorQuestion
        ? `${moderatorText} Follow-up: ${creatorQuestion}`
        : moderatorText,
      tags: tags.join(",")
    });
    const utterance = createEvent({
      episodeId,
      type: "utterance",
      speakerId,
      text: baseText,
      tags: tags.join(",")
    });
    const challenger = challengerText.trim()
      ? createEvent({
          episodeId,
          type: "crossfire",
          speakerId: challengerId,
          text: challengerText,
          tags: tags.join(",")
        })
      : null;
    updateEpisodeStatus(episodeId, "live");
    return { moderator, utterance, challenger };
  });

  return {
    moderator: created.moderator,
    utterance: created.utterance,
    challenger: created.challenger
  };
}
