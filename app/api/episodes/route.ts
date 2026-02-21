import { NextResponse } from "next/server";
import { z } from "zod";
import { createEpisode } from "@/lib/store";

export const runtime = "nodejs";

const createEpisodeSchema = z.object({
  source: z.object({
    type: z.enum(["url", "text"]),
    value: z.string().min(1),
    parsedClaim: z.string().min(1),
    parsedTensions: z.array(z.string()).min(1),
    parsedQuestions: z.array(z.string()).min(1)
  }),
  cast: z.object({
    moderatorId: z.string().min(1),
    panelistIds: z.array(z.string().min(1)).min(2).max(4),
    guestPrompt: z.string().optional().default("")
  }),
  controls: z.object({
    seriousness: z.number().min(0).max(1),
    humor: z.number().min(0).max(1),
    confrontation: z.number().min(0).max(1),
    durationMinutes: z.number().int().min(5).max(60)
  })
});

export async function POST(req: Request) {
  const parsed = createEpisodeSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid episode payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { source, cast, controls } = parsed.data;
  const data = {
    sourceType: String(source.type ?? "text"),
    sourceValue: String(source.value ?? ""),
    parsedClaim: String(source.parsedClaim ?? ""),
    parsedTensions: (source.parsedTensions ?? [])
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .join(" | "),
    parsedQuestions: (source.parsedQuestions ?? [])
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .join(" | "),
    moderatorId: String(cast.moderatorId ?? "editor_v1"),
    panelistIds: (cast.panelistIds ?? [])
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .join(","),
    guestPrompt: String(cast.guestPrompt ?? ""),
    seriousness: Number(controls.seriousness),
    humor: Number(controls.humor),
    confrontation: Number(controls.confrontation),
    durationMinutes: Number(controls.durationMinutes),
    status: "draft"
  };

  try {
    const episode = createEpisode(data);
    return NextResponse.json({ episodeId: episode.id });
  } catch (error) {
    console.error("Episode create failed", {
      error,
      payloadPreview: {
        sourceType: data.sourceType,
        sourceValueLen: data.sourceValue.length,
        parsedClaimLen: data.parsedClaim.length,
        tensionsLen: data.parsedTensions.length,
        questionsLen: data.parsedQuestions.length,
        moderatorId: data.moderatorId,
        panelistIds: data.panelistIds
      }
    });
    return NextResponse.json(
      {
        error: "Failed to create episode",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
