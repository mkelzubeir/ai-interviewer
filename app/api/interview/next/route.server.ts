import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdaptiveTurn, isOpenAIConfigured } from "@/lib/openai-provider";

const requestSchema = z.object({ resume: z.string().min(1).max(30_000), jobDescription: z.string().min(1).max(30_000), interviewType: z.string().min(1), remainingBudget: z.number().int().nonnegative(), transcript: z.array(z.object({ question: z.string(), answer: z.string(), competency: z.string() })).max(12), topicsCovered: z.array(z.string()).max(12), claims: z.array(z.string()).max(12) });
const requests = new Map<string, number[]>();

function allowed(ip: string) { const now = Date.now(); const windowStart = now - 60_000; const existing = (requests.get(ip) ?? []).filter((time) => time > windowStart); if (existing.length >= 10) return false; existing.push(now); requests.set(ip, existing); return true; }

export async function POST(request: NextRequest) {
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "OpenAI mode is not configured; use deterministic mode instead." }, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowed(ip)) return NextResponse.json({ error: "Too many interview requests. Please wait a minute." }, { status: 429 });
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid interview context." }, { status: 400 });
  try { return NextResponse.json(await getAdaptiveTurn(body.data)); } catch (error) { const message = error instanceof Error ? error.message : "Provider unavailable"; const status = message === "OPENAI_NOT_CONFIGURED" ? 503 : 502; return NextResponse.json({ error: status === 503 ? "OpenAI mode is not configured." : "OpenAI could not prepare the next question. You can continue in deterministic mode." }, { status }); }
}
