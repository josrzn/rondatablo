import { db } from "./db";
import type { DebateStepAction } from "./types";

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

function pickLine(lines: string[], count: number): string {
  if (lines.length === 0) {
    return "I need a more specific claim before I can respond.";
  }
  return lines[count % lines.length] ?? lines[0];
}

export async function runDebateStep(
  episodeId: string,
  action: DebateStepAction,
  creatorQuestion?: string
) {
  const episode = await db.episode.findUnique({
    where: { id: episodeId },
    include: {
      events: {
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!episode) {
    throw new Error("Episode not found");
  }

  const panelistIds = episode.panelistIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const speakerTurnCount = episode.events.filter((event) => event.type === "utterance").length;
  const speakerId = pickNextSpeaker(panelistIds, speakerTurnCount);
  const baseText = pickLine(speakerTemplates[speakerId] ?? [], speakerTurnCount);

  const moderatorCount = episode.events.filter((event) => event.speakerId === MODERATOR_ID).length;
  const moderatorText = pickLine(moderatorTemplates[action], moderatorCount);

  const created = await db.$transaction([
    db.event.create({
      data: {
        episodeId,
        type: "moderator",
        speakerId: MODERATOR_ID,
        text: creatorQuestion
          ? `${moderatorText} Follow-up: ${creatorQuestion}`
          : moderatorText,
        tags: `action:${action}`
      }
    }),
    db.event.create({
      data: {
        episodeId,
        type: "utterance",
        speakerId,
        text: baseText,
        tags: `action:${action}`
      }
    }),
    db.episode.update({
      where: { id: episodeId },
      data: { status: "live" }
    })
  ]);

  return {
    moderator: created[0],
    utterance: created[1]
  };
}
