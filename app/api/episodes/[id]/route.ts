import { NextResponse } from "next/server";
import { db } from "@/lib/db";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const episode = await db.episode.findUnique({
    where: { id },
    include: {
      events: {
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  return NextResponse.json(episode);
}
