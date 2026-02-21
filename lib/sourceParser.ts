import type { ParseSourceResponse, SourceType } from "./types";
import { z } from "zod";
import { generateObject, llmAvailable } from "./llm";

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function splitSentences(input: string): string[] {
  return normalizeText(input)
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripHtml(html: string): string {
  return normalizeText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  );
}

function textFromHtml(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  const title = normalizeText(stripHtml(titleMatch?.[1] ?? ""));
  const container = articleMatch?.[1] ?? mainMatch?.[1] ?? bodyMatch?.[1] ?? html;
  const text = stripHtml(container);

  return { title, text };
}

function keywordTensions(text: string): string[] {
  const lower = text.toLowerCase();
  const tensions = ["Speed of adoption vs reliability of outcomes"];

  if (/(governance|regulation|institution|policy|coordination)/.test(lower)) {
    tensions.push("Deployment velocity vs governance and coordination capacity");
  }
  if (/(labor|worker|job|employment|wage|inequality)/.test(lower)) {
    tensions.push("Efficiency gains vs labor stability and bargaining power");
  }
  if (/(startup|enterprise|competition|market|moat|advantage)/.test(lower)) {
    tensions.push("Short-term market wins vs long-term resilience");
  }
  if (/(model|automation|agent|software factory|workflow)/.test(lower)) {
    tensions.push("Capability growth vs operational redesign bottlenecks");
  }

  while (tensions.length < 3) {
    tensions.push("Centralized leverage vs broad distribution of benefits");
  }

  return tensions.slice(0, 4);
}

function buildQuestions(text: string): string[] {
  const lower = text.toLowerCase();
  const questions = ["Which assumption in this argument is most likely to fail first?"];

  if (/(next year|12 months|timeline|soon|imminent)/.test(lower)) {
    questions.push("What specific prediction here should be true within 12 months?");
  } else {
    questions.push("What concrete signal in the next 12 months would validate this view?");
  }

  if (/(enterprise|team|organization|manager|workflow)/.test(lower)) {
    questions.push("What changes first inside a real team: budget, process, or headcount?");
  } else {
    questions.push("Who captures the upside first, and who absorbs transition costs?");
  }

  return questions;
}

function parseTextContent(
  rawText: string,
  title = "",
  warning?: string
): ParseSourceResponse {
  const normalized = normalizeText(rawText);
  const sentences = splitSentences(normalized);
  const claim =
    sentences[0] ??
    "AI is creating strategic uncertainty that demands explicit tradeoff decisions.";
  const tensions = keywordTensions(normalized);
  const openQuestions = buildQuestions(normalized);
  const sourceExcerpt = normalizeText(sentences.slice(0, 3).join(" ")).slice(0, 360);

  return {
    claim,
    tensions,
    openQuestions,
    sourceTitle: title || undefined,
    sourceExcerpt,
    mode: "heuristic",
    warning
  };
}

const analysisSchema = z.object({
  claim: z.string().min(10),
  tensions: z.array(z.string().min(5)).min(3).max(4),
  tensionEvidence: z.array(z.string().min(5)).min(0).max(4).optional(),
  openQuestions: z.array(z.string().min(8)).min(3).max(4)
});

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const mapped = value
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (item && typeof item === "object" && "text" in item) {
        const text = (item as { text?: unknown }).text;
        return typeof text === "string" ? text.trim() : "";
      }
      return "";
    })
    .filter(Boolean);
  return mapped.length ? mapped : null;
}

function normalizeAnalysisObject(raw: unknown): unknown {
  const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const source =
    root.analysis && typeof root.analysis === "object"
      ? (root.analysis as Record<string, unknown>)
      : root;

  const claim =
    asString(source.claim) ??
    asString(source.coreClaim) ??
    asString(source.core_claim) ??
    asString(source.mainClaim) ??
    asString(source.main_claim) ??
    asString(source.thesis);

  const tensions =
    asStringArray(source.tensions) ??
    asStringArray(source.tradeoffs) ??
    asStringArray(source.trade_offs) ??
    asStringArray(source.faultLines) ??
    asStringArray(source.fault_lines);

  const openQuestions =
    asStringArray(source.openQuestions) ??
    asStringArray(source.open_questions) ??
    asStringArray(source.questions) ??
    asStringArray(source.debateQuestions) ??
    asStringArray(source.debate_questions);

  const tensionEvidence =
    asStringArray(source.tensionEvidence) ??
    asStringArray(source.tension_evidence) ??
    asStringArray(source.evidence) ??
    asStringArray(source.quotes);

  return {
    claim: claim ?? undefined,
    tensions: tensions ?? undefined,
    tensionEvidence: tensionEvidence ?? undefined,
    openQuestions: openQuestions ?? undefined
  };
}

function tensionLooksBland(tension: string): boolean {
  const text = tension.toLowerCase();
  const genericPairs = [
    "speed of adoption vs reliability",
    "deployment velocity vs governance",
    "productivity gains vs labor",
    "centralized leverage vs broad distribution"
  ];
  const genericHit = genericPairs.some((pair) => text.includes(pair));
  const hasQuote = /["'][^"']{8,140}["']/.test(tension);
  return genericHit || !hasQuote || tension.length < 55;
}

function tensionTooLong(tension: string): boolean {
  return tension.length > 220;
}

function needsTensionRewrite(tensions: string[]): boolean {
  if (tensions.length < 3) {
    return true;
  }
  return (
    tensions.filter((t) => tensionLooksBland(t)).length >= 2 ||
    tensions.some((t) => tensionTooLong(t))
  );
}

async function rewriteTensionsWithGrounding(input: {
  claim: string;
  tensions: string[];
  openQuestions: string[];
  excerpt: string;
}): Promise<{ tensions: string[]; tensionEvidence: string[] }> {
  const raw = await generateObject({
    system: [
      "You are rewriting debate tensions to be concrete and source-grounded.",
      "Return only JSON."
    ].join(" "),
    user: [
      "Rewrite the tensions so they are specific to the source text, not generic AI clichés.",
      "Output object shape: { \"tensions\": string[], \"evidence\": string[] }",
      "Rules for each tension:",
      "1) Exactly 3 tensions.",
      "2) Each tension max 220 characters.",
      "3) Format: <specific conflict> — <why this matters>.",
      "4) Do NOT include quotes inside the tension line.",
      "5) Mention at least one concrete noun/entity from the source.",
      "6) evidence must contain 3 short source quotes, one per tension.",
      "",
      `Claim: ${input.claim}`,
      `Current tensions: ${input.tensions.join(" | ")}`,
      `Open questions: ${input.openQuestions.join(" | ")}`,
      "",
      "Source excerpt:",
      input.excerpt
    ].join("\n"),
    temperature: 0.45
  });

  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const tensionsRaw = asStringArray(obj.tensions);
  const evidenceRaw = asStringArray(obj.evidence);
  if (!tensionsRaw || tensionsRaw.length < 3 || !evidenceRaw || evidenceRaw.length < 3) {
    throw new Error("LLM rewrite did not return valid tensions");
  }
  const tensions = tensionsRaw.slice(0, 3).map((t) => normalizeText(t).slice(0, 220));
  const tensionEvidence = evidenceRaw.slice(0, 3).map((e) => normalizeText(e).slice(0, 180));
  return { tensions, tensionEvidence };
}

function compressTensions(tensions: string[]): string[] {
  return tensions.slice(0, 3).map((t) => normalizeText(t).slice(0, 220));
}

async function analyzeWithLlm(
  text: string,
  title?: string
): Promise<ParseSourceResponse | null> {
  if (!llmAvailable()) {
    return null;
  }

  const excerpt = normalizeText(text).slice(0, 10000);
  const raw = await generateObject(
    {
      system: [
        "You analyze source material for a high-quality AI policy/economy debate.",
        "Return only JSON.",
        "Focus on contestable claims, concrete tensions, and debate-driving questions."
      ].join(" "),
      user: [
        title ? `Title: ${title}` : "",
        "Return this exact object shape and key names:",
        '{ "claim": string, "tensions": string[], "openQuestions": string[] }',
        "Task requirements:",
        "1) claim: one core claim in a single sentence.",
        "2) tensions: 3-4 sharp tradeoffs.",
        "3) openQuestions: 3-4 questions that force predictions/mechanisms.",
        "",
        "Source excerpt:",
        excerpt
      ]
        .filter(Boolean)
        .join("\n"),
      temperature: 0.35
    }
  );
  const normalized = normalizeAnalysisObject(raw);
  const result = analysisSchema.parse(normalized);
  let tensions = compressTensions(result.tensions);
  let tensionEvidence = (result.tensionEvidence ?? []).slice(0, 3);
  if (needsTensionRewrite(tensions)) {
    try {
      const rewritten = await rewriteTensionsWithGrounding({
        claim: result.claim,
        tensions,
        openQuestions: result.openQuestions,
        excerpt
      });
      tensions = rewritten.tensions;
      tensionEvidence = rewritten.tensionEvidence;
    } catch {
      // Keep original tensions if rewrite pass fails.
    }
  }

  return {
    claim: result.claim,
    tensions,
    tensionEvidence,
    openQuestions: result.openQuestions,
    sourceTitle: title || undefined,
    sourceExcerpt: excerpt.slice(0, 360),
    mode: "llm"
  };
}

async function parseUrlSource(value: string): Promise<ParseSourceResponse> {
  const url = new URL(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "RondatabloPilot/0.1 (+local development)"
      }
    });

    if (!res.ok) {
      throw new Error(`Source fetch failed with HTTP ${res.status}`);
    }

    const html = await res.text();
    const { title, text } = textFromHtml(html);
    if (!text || text.length < 200) {
      throw new Error("Source text too short after extraction");
    }

    try {
      const llmParsed = await analyzeWithLlm(text, title);
      if (llmParsed) {
        return llmParsed;
      }
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : "Unknown LLM failure";
      return parseTextContent(
        text,
        title,
        `LLM analysis failed; using heuristic parser. Reason: ${reason}`
      );
    }

    return parseTextContent(text, title);
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Unknown source fetch failure";
    const clean = url.toString().replace(/^https?:\/\//, "");
    return {
      claim: `The source at ${clean} argues that AI capability gains are pushing institutions and teams to adapt faster than current operating models.`,
      tensions: [
        "Speed of AI deployment vs governance capacity",
        "Productivity gains vs labor displacement",
        "Centralization of power vs broader access"
      ],
      openQuestions: [
        "What breaks first in real organizations?",
        "Which predictions are testable in 12 months?",
        "Who captures most of the upside and why?"
      ],
      sourceTitle: clean,
      mode: "fallback",
      warning: `Source fetch/extraction failed; using fallback summary. Reason: ${reason}`
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function parseSource(
  sourceType: SourceType,
  value: string
): Promise<ParseSourceResponse> {
  if (sourceType === "url") {
    return parseUrlSource(value);
  }
  try {
    const llmParsed = await analyzeWithLlm(value);
    if (llmParsed) {
      return llmParsed;
    }
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Unknown LLM failure";
    return parseTextContent(
      value,
      "",
      `LLM analysis failed; using heuristic parser. Reason: ${reason}`
    );
  }
  return parseTextContent(value);
}
