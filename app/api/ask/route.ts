import { NextResponse } from "next/server";
import { z } from "zod";
import { answerAdvanced } from "@/lib/pipeline";

export const runtime = "nodejs";

const AskRequestSchema = z.object({
  question: z.string().min(1).max(1000),
  userId: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const body = AskRequestSchema.parse(await request.json());
    const result = await answerAdvanced(body.question, body.userId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
