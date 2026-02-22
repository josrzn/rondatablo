import { NextResponse } from "next/server";
import { z } from "zod";
import { getEpisodeWithEvents } from "@/lib/store";
import { generateHostSuggestion } from "@/lib/hostSuggestion";

export const runtime = "nodejs";

const schema = z.object({
  mode: z.enum(["opening", "next", "closing"])
});

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid suggestion payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const episode = getEpisodeWithEvents(id);
  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  try {
    const text = await generateHostSuggestion({
      mode: parsed.data.mode,
      episode
    });
    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

