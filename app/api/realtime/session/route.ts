import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildInterviewerInstructions } from "@/lib/openai/realtime/session-config";

const bodySchema = z.object({ sessionId: z.string().uuid(), interviewType: z.string().min(1).max(80), roleSummary: z.string().min(1).max(1000), candidateSummary: z.string().min(1).max(1000), competencies: z.array(z.string().max(80)).max(8), claims: z.array(z.string().max(200)).max(8), remainingBudget: z.number().int().min(1).max(10) });
const rate = new Map<string, number[]>();
function permitted(ip: string) { const now = Date.now(); const values = (rate.get(ip) ?? []).filter((time) => time > now - 60_000); if (values.length >= 3) return false; rate.set(ip, [...values, now]); return true; }

export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Voice mode is not configured. Continue in text mode." }, { status: 503, headers });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!permitted(ip)) return NextResponse.json({ error: "Please wait before starting another voice session." }, { status: 429, headers });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid voice interview session." }, { status: 400, headers });
  try {
    const data = parsed.data; const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 1, timeout: 15_000 });
    const secret = await client.realtime.clientSecrets.create({ expires_after: { anchor: "created_at", seconds: 120 }, session: { type: "realtime", model: process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime", output_modalities: ["audio"], max_output_tokens: 300, instructions: buildInterviewerInstructions(data), audio: { input: { transcription: { model: "gpt-4o-mini-transcribe", language: "en" }, turn_detection: { type: "server_vad", create_response: true, interrupt_response: true, prefix_padding_ms: 300, silence_duration_ms: 900 } }, output: { voice: process.env.OPENAI_REALTIME_VOICE || "marin" } }, tracing: null } });
    return NextResponse.json({ value: secret.value, expiresAt: secret.expires_at, model: process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime", voice: process.env.OPENAI_REALTIME_VOICE || "marin" }, { headers });
  } catch { return NextResponse.json({ error: "Voice session could not be prepared. Continue in text mode or try again." }, { status: 502, headers }); }
}
