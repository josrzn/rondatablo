import { NextResponse } from "next/server";
import { z } from "zod";
import { parseSource } from "@/lib/sourceParser";

const schema = z.object({
  sourceType: z.enum(["url", "text"]),
  value: z.string().min(1)
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = parseSource(parsed.data.sourceType, parsed.data.value);
  return NextResponse.json(result);
}
