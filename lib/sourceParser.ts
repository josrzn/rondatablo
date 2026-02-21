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
  title = ""
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
    mode: "text"
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

    const parsed = parseTextContent(text, title);
    return {
      ...parsed,
      mode: "fetched"
    };
  } catch {
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
      mode: "fallback"
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
  return parseTextContent(value);
}
