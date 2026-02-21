import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const eventSchema = z.object({
  type: z.string().min(1),
  speakerId: z.string().min(1),
  text: z.string().min(1),
  tags: z.array(z.string()).default([])
});

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const events = await db.event.findMany({
    where: { episodeId: id },
    orderBy: { createdAt: "asc" }
  });
  return NextResponse.json(events);
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const parsed = eventSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid event payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const event = await db.event.create({
    data: {
      episodeId: id,
      type: parsed.data.type,
      speakerId: parsed.data.speakerId,
      text: parsed.data.text,
      tags: parsed.data.tags.join(",")
    }
  });

  return NextResponse.json(event);
}
