import { z } from "zod";

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-5-mini";
const DEFAULT_ARBITER_MODEL = process.env.OPENAI_ARBITER_MODEL ?? "gpt-4.1-mini";

type JsonPromptInput = {
  system: string;
  user: string;
  temperature?: number;
  model?: string;
  maxOutputTokens?: number;
};

function hasApiKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function stripMarkdownFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function extractBalancedJson(raw: string): string {
  const text = stripMarkdownFences(raw);
  if (!text) {
    throw new Error("LLM response was empty");
  }

  if (text.startsWith("{") || text.startsWith("[")) {
    return text;
  }

  const start = text.search(/[{\[]/);
  if (start < 0) {
    throw new Error("LLM response did not contain a JSON object");
  }

  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === opener) {
      depth += 1;
      continue;
    }
    if (ch === closer) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  throw new Error("LLM response contained incomplete JSON");
}

function parseJsonSafely(raw: string): unknown {
  const candidate = extractBalancedJson(raw);
  try {
    return JSON.parse(candidate) as unknown;
  } catch (error) {
    const preview = raw.slice(0, 120).replace(/\s+/g, " ");
    throw new Error(
      `LLM JSON parse failed: ${error instanceof Error ? error.message : "Unknown parse error"}; raw="${preview}"`
    );
  }
}

async function openAIResponseText(input: JsonPromptInput): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const model = input.model ?? DEFAULT_MODEL;
  const supportsTemperature = !model.startsWith("gpt-5");
  const payload: Record<string, unknown> = {
    model,
    text: {
      format: {
        type: "json_object"
      }
    },
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: input.system }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: input.user }]
      }
    ]
  };
  if (supportsTemperature && typeof input.temperature === "number") {
    payload.temperature = input.temperature;
  }
  if (typeof input.maxOutputTokens === "number") {
    payload.max_output_tokens = input.maxOutputTokens;
  }
  if (model.startsWith("gpt-5")) {
    payload.reasoning = { effort: "minimal" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify(payload),
    signal: controller.signal
  });
  clearTimeout(timeout);

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI call failed (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as Record<string, unknown>;

  const outputText = data.output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText;
  }

  const chunks: string[] = [];
  const output = Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const topLevelText = (item as { text?: unknown }).text;
    if (typeof topLevelText === "string" && topLevelText.trim()) {
      chunks.push(topLevelText.trim());
    }
    const content = Array.isArray((item as { content?: unknown }).content)
      ? ((item as { content?: unknown }).content as unknown[])
      : [];
    for (const piece of content) {
      if (!piece || typeof piece !== "object") {
        continue;
      }
      const text = (piece as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) {
        chunks.push(text.trim());
        continue;
      }
      if (text && typeof text === "object") {
        const nested = (text as { value?: unknown }).value;
        if (typeof nested === "string" && nested.trim()) {
          chunks.push(nested.trim());
        }
      }
    }
  }

  const joined = chunks.join("\n").trim();

  if (!joined) {
    const incomplete = data.incomplete_details;
    const incompleteReason =
      incomplete && typeof incomplete === "object"
        ? (incomplete as { reason?: unknown }).reason
        : undefined;
    if (
      incompleteReason === "max_output_tokens" &&
      typeof input.maxOutputTokens === "number" &&
      input.maxOutputTokens < 1200
    ) {
      return openAIResponseText({
        ...input,
        maxOutputTokens: Math.min(1200, input.maxOutputTokens * 2)
      });
    }

    const status = typeof data.status === "string" ? data.status : "unknown";
    const err = data.error;
    const errText =
      err && typeof err === "object"
        ? JSON.stringify(err).slice(0, 240)
        : "none";
    throw new Error(
      `OpenAI response contained no text (status=${status}, error=${errText})`
    );
  }

  return joined;
}

export async function generateJson<T>(
  input: JsonPromptInput,
  schema: z.ZodSchema<T>
): Promise<T> {
  const parsed = await generateObject(input);
  return schema.parse(parsed);
}

export async function generateObject(input: JsonPromptInput): Promise<unknown> {
  const firstRaw = await openAIResponseText(input);
  try {
    return parseJsonSafely(firstRaw);
  } catch {
    const retryRaw = await openAIResponseText({
      ...input,
      system: `${input.system} STRICT MODE: Return only valid JSON. Do not include prose or markdown.`,
      user: `${input.user}\n\nReturn only valid JSON now.`
    });
    return parseJsonSafely(retryRaw);
  }
}

export const llmAvailable = hasApiKey;
export const llmDefaultArbiterModel = DEFAULT_ARBITER_MODEL;
