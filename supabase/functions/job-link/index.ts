// Supabase Edge Function: turn a link to a job posting into job description text.
//
// This exists so the GitHub Pages static export — which cannot run Next.js
// route handlers — can import a role from a URL. It is also the reason the
// browser is not asked to fetch the posting itself: a page on another origin is
// unreadable from the browser, and the extracted text has to reach OpenAI
// anyway. OPENAI_API_KEY lives only in Supabase function secrets.
//
// The pipeline, including the SSRF guard, is shared with the Next.js route
// handler in ../_shared/job-link.ts.
//
// Deploy:  supabase functions deploy job-link
// Secrets: supabase secrets set OPENAI_API_KEY=... [OPENAI_MODEL=...]

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { importJobDescription } from "../_shared/job-link.ts";

// Per-user quota, enforced in Postgres for the same reason as voice tokens:
// Edge Functions are stateless, so an in-memory counter would reset on every
// cold start and be bypassed by concurrent instances.
const RATE_LIMIT_WINDOW = "10 minutes";
const RATE_LIMIT_MAX = 12;

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  const cors = corsHeaders(origin);

  // An origin outside the allowlist gets no CORS headers, so the browser blocks
  // it from reading anything regardless of status.
  if (!cors) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, cors);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error("job-link is missing required secrets");
    return json({ error: "Link import is not configured. Paste the job description instead." }, 503, cors);
  }

  // Verify the caller's session JWT against the auth server. The publishable
  // key alone resolves to no user, so anonymous callers are rejected here.
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Could not prepare this request. Reload and try again." }, 401, cors);
  }
  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: userData, error: userError } = await asCaller.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return json({ error: "Could not prepare this request. Reload and try again." }, 401, cors);

  const body = await request.json().catch(() => null);
  const url = (body as { url?: unknown } | null)?.url;
  if (typeof url !== "string" || !url.trim()) return json({ error: "Paste a link to the job posting." }, 400, cors);

  // Atomic check-and-insert; service role bypasses RLS on the grants table.
  const asService = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: allowed, error: claimError } = await asService.rpc("claim_job_link", {
    p_user_id: user.id,
    p_window: RATE_LIMIT_WINDOW,
    p_limit: RATE_LIMIT_MAX,
  });
  if (claimError) {
    console.error("claim_job_link failed:", claimError.message);
    return json({ error: "We could not import that link. Paste the job description instead." }, 502, cors);
  }
  if (allowed !== true) {
    return json({ error: `You have imported ${RATE_LIMIT_MAX} links recently. Please wait a few minutes, or paste the description.` }, 429, cors);
  }

  const result = await importJobDescription(url, {
    openAIKey: Deno.env.get("OPENAI_API_KEY") ?? null,
    model: Deno.env.get("OPENAI_MODEL") || "gpt-5.6-terra",
  });

  if (!result.ok) return json({ error: result.message }, result.status, cors);
  return json({ jobDescription: result.jobDescription, sourceUrl: result.sourceUrl, distilled: result.distilled }, 200, cors);
});
