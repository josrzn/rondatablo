import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

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
  const episode = await db.episode.create({
    data: {
      sourceType: source.type,
      sourceValue: source.value,
      parsedClaim: source.parsedClaim,
      parsedTensions: source.parsedTensions.join(" | "),
      parsedQuestions: source.parsedQuestions.join(" | "),
      moderatorId: cast.moderatorId,
      panelistIds: cast.panelistIds.join(","),
      guestPrompt: cast.guestPrompt ?? "",
      seriousness: controls.seriousness,
      humor: controls.humor,
      confrontation: controls.confrontation,
      durationMinutes: controls.durationMinutes,
      status: "draft"
    }
  });

  return NextResponse.json({ episodeId: episode.id });
}
