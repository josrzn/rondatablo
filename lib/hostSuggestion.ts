import { z } from "zod";
import { generateJson, llmAvailable } from "./llm";
import type { EventRecord, EpisodeRecord } from "./store";

export type HostSuggestionMode = "opening" | "next" | "closing";

const hostSuggestionSchema = z.object({
  text: z.string().min(24).max(900)
});

function modeInstructions(mode: HostSuggestionMode): string {
  if (mode === "opening") {
    return "Write an opening line the host can say immediately: set context + why it matters + one sharp opening question.";
  }
  if (mode === "next") {
    return "Write a next-turn host intervention that references the latest exchange and asks one pointed follow-up question.";
  }
  return "Write a closing sequence line: invite one-sentence parting thoughts and frame a concise close.";
}

export async function generateHostSuggestion(input: {
  mode: HostSuggestionMode;
  episode: EpisodeRecord & { events: EventRecord[] };
}): Promise<string> {
  if (!llmAvailable()) {
    throw new Error("OPENAI_API_KEY is missing for host suggestions");
  }

  const recentTranscript = input.episode.events
    .map((event) => `${event.speakerId} (${event.type}): ${event.text}`)
    .join("\n");

  const parsed = await generateJson(
    {
      model: process.env.OPENAI_DEBATE_MODEL || process.env.OPENAI_MODEL,
      system: [
        "You are the host writer for a live debate show.",
        "Return one host line ready to read aloud right now.",
        "Sound natural, concise, and engaging.",
        "No meta-instructions. No bullet points. No stage directions.",
        "Output strict JSON only."
      ].join(" "),
      user: [
        `Mode: ${input.mode}`,
        modeInstructions(input.mode),
        `Source claim: ${input.episode.parsedClaim}`,
        `Tensions: ${input.episode.parsedTensions}`,
        `Questions: ${input.episode.parsedQuestions}`,
        "",
        "Recent transcript:",
        recentTranscript || "No prior transcript.",
        "",
        "Return JSON shape:",
        '{ "text": string }',
        "Rules:",
        "1) 1-3 sentences.",
        "2) 28-120 words.",
        "3) Must be directly speakable as-is by the host.",
        "4) Keep language plain and vivid."
      ].join("\n"),
      temperature: 0.8,
      maxOutputTokens: 260
    },
    hostSuggestionSchema
  );

  const text = parsed.text.trim();
  if (text.length <= 520) {
    return text;
  }
  // Hard safety clamp so overly long but valid LLM responses don't break UX.
  return `${text.slice(0, 517).trimEnd()}...`;
}
