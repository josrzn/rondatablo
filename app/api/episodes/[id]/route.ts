import { NextResponse } from "next/server";
import { getEpisodeWithEvents } from "@/lib/store";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const episode = getEpisodeWithEvents(id);

  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  return NextResponse.json(episode);
}
