import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { importJobDescription } from "@/lib/job-link";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";
import { openAIEnv, serverEnv } from "@/lib/server-env";

/**
 * Import a job description from a link to the posting.
 *
 * This endpoint fetches a URL chosen by the caller, so the host allowlisting,
 * per-hop redirect checking and body cap in `importJobDescription` are the
 * security boundary rather than a nicety. It is rate limited on top of that,
 * because every successful import also spends OpenAI credits.
 */

const bodySchema = z.object({ url: z.string().min(1).max(2048) });

const limiter = createRateLimiter({ limit: 8, windowMs: 60_000 });

export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };

  const validated = serverEnv();
  if (!validated.ok) {
    console.warn("Job link import disabled by invalid environment:", validated.issues.join("; "));
    return NextResponse.json({ error: "Link import is misconfigured on the server. Paste the job description instead." }, { status: 503, headers });
  }

  if (!limiter.check(clientKey(request.headers.get("x-forwarded-for")))) {
    return NextResponse.json({ error: "Too many links imported just now. Wait a moment, or paste the description." }, { status: 429, headers });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paste a link to the job posting." }, { status: 400, headers });

  // Without a key the page text is still extracted and returned; it is simply
  // not distilled into headings first.
  const env = openAIEnv();
  const result = await importJobDescription(parsed.data.url, {
    openAIKey: env?.OPENAI_API_KEY ?? null,
    model: env?.OPENAI_MODEL,
    timeoutMs: validated.env.OPENAI_REQUEST_TIMEOUT_MS,
  });

  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status, headers });
  return NextResponse.json({ jobDescription: result.jobDescription, sourceUrl: result.sourceUrl, distilled: result.distilled }, { headers });
}
