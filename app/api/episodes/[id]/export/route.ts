import { NextResponse } from "next/server";
import { exportEpisodePack } from "@/lib/exporter";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const result = await exportEpisodePack(id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 404 }
    );
  }
}
