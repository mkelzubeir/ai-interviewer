/**
 * Application-side entry point for job-link import.
 *
 * The server pipeline lives under `supabase/functions/_shared/` because that is
 * the directory the Supabase CLI bundles for the Edge Function; re-exporting it
 * here keeps a single source of truth. This file adds the browser half: which
 * endpoint to call, and how to read its answer.
 */
export {
  MAX_DESCRIPTION_CHARS,
  MAX_TEXT_CHARS,
  extractJobText,
  extractJsonLdPosting,
  fetchJobPage,
  importJobDescription,
  isBlockedHostname,
  looksLikeJobPosting,
  normalizeJobUrl,
  readResponseText,
  stripTags,
  type ImportResult,
  type UrlResult,
} from "@/supabase/functions/_shared/job-link";

import { normalizeJobUrl } from "@/supabase/functions/_shared/job-link";

/**
 * Where a link is turned into a job description.
 *
 * Same split as the Realtime token endpoint: a server build uses its own route
 * handler, the static export calls a Supabase Edge Function, and that function
 * is public so it requires the anonymous session's JWT.
 */
export type JobLinkSource =
  | { kind: "next-route"; url: string; requiresAuth: false }
  | { kind: "edge-function"; url: string; requiresAuth: true };

export type JobLinkEnvironment = {
  hasServerFeatures: boolean;
  /** Same-origin path to the route handler, already basePath-prefixed. */
  routeUrl: string;
  /** Absolute Edge Function URL, from NEXT_PUBLIC_JOB_LINK_URL. */
  edgeFunctionUrl: string;
};

export function resolveJobLinkSource(env: JobLinkEnvironment): JobLinkSource | null {
  if (env.hasServerFeatures) return { kind: "next-route", url: env.routeUrl, requiresAuth: false };
  if (env.edgeFunctionUrl) return { kind: "edge-function", url: env.edgeFunctionUrl, requiresAuth: true };
  return null;
}

export type JobLinkResponse =
  | { ok: true; jobDescription: string; sourceUrl: string; distilled: boolean }
  | { ok: false; message: string };

export type JobLinkRequest = {
  source: JobLinkSource;
  url: string;
  /** Supabase access token. Required for the Edge Function source. */
  accessToken?: string | null;
  fetchImpl?: typeof fetch;
};

/**
 * Ask the server to import a posting. The URL is validated here as well as on
 * the server: an obvious mistake deserves an instant answer, not a round trip.
 */
export async function requestJobDescription(request: JobLinkRequest): Promise<JobLinkResponse> {
  const { source, url, accessToken, fetchImpl = fetch } = request;

  const target = normalizeJobUrl(url);
  if (!target.ok) return { ok: false, message: target.message };
  if (source.requiresAuth && !accessToken) return { ok: false, message: "Could not prepare this request. Reload and try again." };

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (source.requiresAuth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetchImpl(source.url, { method: "POST", headers, body: JSON.stringify({ url: target.url }) });
  } catch {
    return { ok: false, message: "Could not reach the import service. Paste the description instead." };
  }

  const payload = (await response.json().catch(() => null)) as { error?: unknown; jobDescription?: unknown; sourceUrl?: unknown; distilled?: unknown } | null;

  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : "We could not read that page. Paste the job description instead.";
    return { ok: false, message };
  }
  if (typeof payload?.jobDescription !== "string" || !payload.jobDescription.trim()) {
    return { ok: false, message: "That page had nothing we could use. Paste the job description instead." };
  }

  return {
    ok: true,
    jobDescription: payload.jobDescription,
    sourceUrl: typeof payload.sourceUrl === "string" ? payload.sourceUrl : target.url,
    distilled: payload.distilled === true,
  };
}

/** Host shown back to the user after an import, e.g. "boards.greenhouse.io". */
export function sourceLabel(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return "that page";
  }
}
