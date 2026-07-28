// Supabase Edge Function: mint a short-lived OpenAI Realtime client secret.
//
// This exists so the GitHub Pages static export — which cannot run Next.js
// route handlers — can still start a voice interview. The permanent
// OPENAI_API_KEY lives only in Supabase function secrets. The browser receives
// nothing but an ephemeral `ek_...` secret that expires in two minutes and is
// scoped to a single Realtime session.
//
// Deploy:  supabase functions deploy realtime-token
// Secrets: supabase secrets set OPENAI_API_KEY=... [OPENAI_REALTIME_MODEL=...] [OPENAI_REALTIME_VOICE=...]

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { REALTIME_CLIENT_SECRET_URL, buildRealtimeSessionRequest, type InterviewerContext } from "../_shared/realtime-session.ts";

// Per-user quota. Enforced in Postgres because Edge Functions are stateless and
// horizontally scaled — an in-memory counter would reset on every cold start
// and be trivially bypassed by concurrent instances.
const RATE_LIMIT_WINDOW = "10 minutes";
const RATE_LIMIT_MAX = 5;

const MAX_STRING = 1000;

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Validate and clamp the untrusted request body into an InterviewerContext. */
function parseContext(raw: unknown): InterviewerContext | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const text = (key: string, max = MAX_STRING) => {
    const item = value[key];
    return typeof item === "string" && item.trim() ? item.slice(0, max) : null;
  };
  const list = (key: string, max: number, itemMax: number) => {
    const item = value[key];
    if (!Array.isArray(item)) return null;
    return item.filter((entry): entry is string => typeof entry === "string").slice(0, max).map((entry) => entry.slice(0, itemMax));
  };

  const interviewType = text("interviewType", 80);
  const roleSummary = text("roleSummary");
  const candidateSummary = text("candidateSummary");
  const competencies = list("competencies", 8, 80);
  const claims = list("claims", 8, 200);
  const remainingBudget = value.remainingBudget;

  if (!interviewType || !roleSummary || !candidateSummary || !competencies || !claims) return null;
  if (typeof remainingBudget !== "number" || !Number.isInteger(remainingBudget) || remainingBudget < 1 || remainingBudget > 10) return null;

  return { interviewType, roleSummary, candidateSummary, competencies, claims, remainingBudget };
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  const cors = corsHeaders(origin);

  // An origin outside the allowlist gets no CORS headers, so the browser blocks
  // it from reading anything regardless of status.
  if (!cors) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, cors);

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!openaiKey || !supabaseUrl || !anonKey || !serviceKey) {
    console.error("realtime-token is missing required secrets");
    return json({ error: "Voice mode is not configured. Continue in text mode." }, 503, cors);
  }

  // Verify the caller's session JWT against the auth server. The publishable
  // key alone resolves to no user, so anonymous callers are rejected here.
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Sign in to start a voice interview." }, 401, cors);
  }
  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: userData, error: userError } = await asCaller.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return json({ error: "Sign in to start a voice interview." }, 401, cors);

  const context = parseContext(await request.json().catch(() => null));
  if (!context) return json({ error: "Invalid voice interview session." }, 400, cors);

  // Atomic check-and-insert; service role bypasses RLS on the grants table.
  const asService = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: allowed, error: claimError } = await asService.rpc("claim_voice_token", {
    p_user_id: user.id,
    p_window: RATE_LIMIT_WINDOW,
    p_limit: RATE_LIMIT_MAX,
  });
  if (claimError) {
    console.error("claim_voice_token failed:", claimError.message);
    return json({ error: "Voice session could not be prepared. Continue in text mode or try again." }, 502, cors);
  }
  if (allowed !== true) {
    return json({ error: `You have started ${RATE_LIMIT_MAX} voice sessions recently. Please wait a few minutes.` }, 429, cors);
  }

  const model = Deno.env.get("OPENAI_REALTIME_MODEL") || "gpt-realtime";
  const voice = Deno.env.get("OPENAI_REALTIME_VOICE") || "marin";

  try {
    const response = await fetch(REALTIME_CLIENT_SECRET_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildRealtimeSessionRequest(context, { model, voice })),
    });
    if (!response.ok) {
      // Log the provider detail; never return it, it can echo request content.
      console.error("OpenAI client secret rejected:", response.status, (await response.text()).slice(0, 500));
      return json({ error: "Voice session could not be prepared. Continue in text mode or try again." }, 502, cors);
    }
    const secret = await response.json();
    if (typeof secret?.value !== "string") {
      console.error("OpenAI client secret response had no value");
      return json({ error: "Voice session could not be prepared. Continue in text mode or try again." }, 502, cors);
    }
    // Only the ephemeral secret and its expiry cross back to the browser.
    return json({ value: secret.value, expiresAt: secret.expires_at ?? null, model, voice }, 200, cors);
  } catch (error) {
    console.error("Realtime client secret failed:", error instanceof Error ? error.message : error);
    return json({ error: "Voice session could not be prepared. Continue in text mode or try again." }, 502, cors);
  }
});
