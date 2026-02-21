import { z } from "zod";

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-5-mini";

type JsonPromptInput = {
  system: string;
  user: string;
  temperature?: number;
};

function hasApiKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function extractJsonObject(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("LLM response did not contain a JSON object");
  }
  return raw.slice(start, end + 1);
}

async function openAIResponseText(input: JsonPromptInput): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const supportsTemperature = !DEFAULT_MODEL.startsWith("gpt-5");
  const payload: Record<string, unknown> = {
    model: DEFAULT_MODEL,
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

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI call failed (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  const joined =
    data.output
      ?.flatMap((item) => item.content ?? [])
      .map((c) => c.text ?? "")
      .join("\n")
      .trim() ?? "";

  if (!joined) {
    throw new Error("OpenAI response contained no text");
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
  const raw = await openAIResponseText(input);
  const json = extractJsonObject(raw);
  return JSON.parse(json) as unknown;
}

export const llmAvailable = hasApiKey;
