import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildInterviewerInstructions } from "@/lib/openai/realtime/session-config";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";
import { openAIEnv, serverEnv } from "@/lib/server-env";

const bodySchema = z.object({ sessionId: z.string().uuid(), interviewType: z.string().min(1).max(80), roleSummary: z.string().min(1).max(1000), candidateSummary: z.string().min(1).max(1000), competencies: z.array(z.string().max(80)).max(8), claims: z.array(z.string().max(200)).max(8), remainingBudget: z.number().int().min(1).max(10) });

const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });

export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };

  const validated = serverEnv();
  if (!validated.ok) {
    console.warn("Voice mode disabled by invalid environment:", validated.issues.join("; "));
    return NextResponse.json({ error: "Voice mode is misconfigured on the server. Continue in text mode." }, { status: 503, headers });
  }
  const env = openAIEnv();
  if (!env) return NextResponse.json({ error: "Voice mode is not configured. Continue in text mode." }, { status: 503, headers });

  if (!limiter.check(clientKey(request.headers.get("x-forwarded-for")))) {
    return NextResponse.json({ error: "Please wait before starting another voice session." }, { status: 429, headers });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid voice interview session." }, { status: 400, headers });

  try {
    const data = parsed.data;
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 1, timeout: env.OPENAI_REQUEST_TIMEOUT_MS });
    const secret = await client.realtime.clientSecrets.create({ expires_after: { anchor: "created_at", seconds: 120 }, session: { type: "realtime", model: env.OPENAI_REALTIME_MODEL, output_modalities: ["audio"], max_output_tokens: 300, instructions: buildInterviewerInstructions(data), audio: { input: { transcription: { model: "gpt-4o-mini-transcribe", language: "en" }, turn_detection: { type: "server_vad", create_response: true, interrupt_response: true, prefix_padding_ms: 300, silence_duration_ms: 900 } }, output: { voice: env.OPENAI_REALTIME_VOICE } }, tracing: null } });
    // Only the short-lived client secret crosses to the browser; OPENAI_API_KEY never does.
    return NextResponse.json({ value: secret.value, expiresAt: secret.expires_at, model: env.OPENAI_REALTIME_MODEL, voice: env.OPENAI_REALTIME_VOICE }, { headers });
  } catch (error) {
    console.warn("Realtime client secret failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Voice session could not be prepared. Continue in text mode or try again." }, { status: 502, headers });
  }
}
