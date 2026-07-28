import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ProviderError, getAdaptiveTurn, isOpenAIConfigured } from "@/lib/openai-provider";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";
import { serverEnv } from "@/lib/server-env";

const requestSchema = z.object({ resume: z.string().min(1).max(30_000), jobDescription: z.string().min(1).max(30_000), interviewType: z.string().min(1), remainingBudget: z.number().int().nonnegative(), transcript: z.array(z.object({ question: z.string(), answer: z.string(), competency: z.string() })).max(12), topicsCovered: z.array(z.string()).max(12), claims: z.array(z.string()).max(12) });

const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export async function POST(request: NextRequest) {
  const env = serverEnv();
  if (!env.ok) {
    console.warn("OpenAI mode disabled by invalid environment:", env.issues.join("; "));
    return NextResponse.json({ error: "OpenAI mode is misconfigured on the server; continuing in deterministic mode." }, { status: 503 });
  }
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "OpenAI mode is not configured; use deterministic mode instead." }, { status: 503 });

  if (!limiter.check(clientKey(request.headers.get("x-forwarded-for")))) {
    return NextResponse.json({ error: "Too many interview requests. Please wait a minute." }, { status: 429 });
  }

  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid interview context." }, { status: 400 });

  try {
    return NextResponse.json(await getAdaptiveTurn(body.data));
  } catch (error) {
    const reason = error instanceof ProviderError ? error.reason : "OPENAI_REQUEST_FAILED";
    // Log the detail server-side; the candidate only ever sees a recoverable message.
    console.warn("Adaptive turn failed:", reason, error instanceof Error ? error.message : error);
    if (reason === "OPENAI_NOT_CONFIGURED") return NextResponse.json({ error: "OpenAI mode is not configured." }, { status: 503 });
    return NextResponse.json({ error: "OpenAI could not prepare the next question. You can continue in deterministic mode." }, { status: 502 });
  }
}
