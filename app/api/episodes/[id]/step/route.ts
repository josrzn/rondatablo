import { NextResponse } from "next/server";
import { z } from "zod";
import { runDebateStep } from "@/lib/runtime";

const schema = z.object({
  action: z.enum([
    "normal",
    "push_harder",
    "get_concrete",
    "time_check",
    "creator_followup"
  ]),
  creatorQuestion: z.string().optional()
});

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid step payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await runDebateStep(
      id,
      parsed.data.action,
      parsed.data.creatorQuestion
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 404 }
    );
  }
}
