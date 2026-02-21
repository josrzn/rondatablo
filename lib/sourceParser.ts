import type { ParseSourceResponse, SourceType } from "./types";

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function splitSentences(input: string): string[] {
  return normalizeText(input)
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function inferFromUrl(url: string): string {
  const clean = url.replace(/^https?:\/\//, "");
  return `The source at ${clean} implies AI capability gains are pushing institutions and teams to adapt faster than their current operating models.`;
}

export function parseSource(
  sourceType: SourceType,
  value: string
): ParseSourceResponse {
  if (sourceType === "url") {
    return {
      claim: inferFromUrl(value),
      tensions: [
        "Speed of AI deployment vs governance capacity",
        "Productivity gains vs labor displacement",
        "Centralization of power vs broader access"
      ],
      openQuestions: [
        "What breaks first in real organizations?",
        "Which predictions are testable in 12 months?",
        "Who captures most of the upside and why?"
      ]
    };
  }

  const sentences = splitSentences(value);
  const claim =
    sentences[0] ??
    "AI is creating strategic uncertainty that demands explicit tradeoff decisions.";
  const tensions = [
    sentences[1] ?? "Adoption speed vs quality control",
    "Automation efficiency vs workforce stability",
    "Short-term gains vs long-term institutional resilience"
  ];
  const openQuestions = [
    "What assumptions must hold for this to work?",
    "Where are second-order effects likely to appear first?",
    "What would disconfirm the current narrative?"
  ];

  return { claim, tensions, openQuestions };
}
