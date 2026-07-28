import type { RealtimeCredential } from "./types";

/**
 * Where a Realtime client secret comes from.
 *
 * Local dev and `next start` have a route handler. The GitHub Pages static
 * export does not, so it calls a Supabase Edge Function instead — which
 * requires a signed-in user, because that endpoint is public and spends real
 * OpenAI credits.
 *
 * Neither path ever carries the permanent OPENAI_API_KEY.
 */
export type TokenSource =
  | { kind: "next-route"; url: string; requiresAuth: false }
  | { kind: "edge-function"; url: string; requiresAuth: true };

export type TokenFailure =
  | "not-configured"
  | "auth-required"
  | "rate-limited"
  | "unavailable"
  | "expired";

export type CredentialResult =
  | { ok: true; credential: RealtimeCredential }
  | { ok: false; reason: TokenFailure; message: string };

/** A secret this close to expiry is not worth attempting a negotiation with. */
export const EXPIRY_MARGIN_SECONDS = 5;

export type TokenEnvironment = {
  /** True when route handlers exist in this build. */
  hasServerFeatures: boolean;
  /** Same-origin path to the Next.js route, already basePath-prefixed. */
  routeUrl: string;
  /** Absolute Edge Function URL, from NEXT_PUBLIC_REALTIME_TOKEN_URL. */
  edgeFunctionUrl: string;
};

/**
 * Pick the token source for this build.
 *
 * A server build prefers its own route: it needs no sign-in and keeps local
 * development working with nothing but OPENAI_API_KEY.
 */
export function resolveTokenSource(env: TokenEnvironment): TokenSource | null {
  if (env.hasServerFeatures) return { kind: "next-route", url: env.routeUrl, requiresAuth: false };
  if (env.edgeFunctionUrl) return { kind: "edge-function", url: env.edgeFunctionUrl, requiresAuth: true };
  return null;
}

function failureFor(status: number): { reason: TokenFailure; fallback: string } {
  if (status === 401 || status === 403) return { reason: "auth-required", fallback: "Sign in to start a voice interview." };
  if (status === 429) return { reason: "rate-limited", fallback: "Too many voice sessions recently. Please wait a few minutes." };
  if (status === 503) return { reason: "not-configured", fallback: "Voice mode is not configured. Continue in text mode." };
  return { reason: "unavailable", fallback: "Voice session could not be prepared. Continue in text mode or try again." };
}

export type CredentialRequest = {
  source: TokenSource;
  sessionId: string;
  context: Record<string, unknown>;
  /** Supabase access token. Required for the Edge Function source. */
  accessToken?: string | null;
  fetchImpl?: typeof fetch;
  /** Seconds since the epoch; injectable so expiry handling is testable. */
  now?: () => number;
};

export async function requestRealtimeCredential(request: CredentialRequest): Promise<CredentialResult> {
  const { source, sessionId, context, accessToken, fetchImpl = fetch, now = () => Math.floor(Date.now() / 1000) } = request;

  if (source.requiresAuth && !accessToken) {
    return { ok: false, reason: "auth-required", message: "Sign in to start a voice interview." };
  }

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (source.requiresAuth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetchImpl(source.url, { method: "POST", headers, body: JSON.stringify({ sessionId, ...context }) });
  } catch {
    return { ok: false, reason: "unavailable", message: "Could not reach the voice service. Continue in text mode or try again." };
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const { reason, fallback } = failureFor(response.status);
    const message = typeof (payload as { error?: unknown } | null)?.error === "string" ? String((payload as { error: string }).error) : fallback;
    return { ok: false, reason, message };
  }

  const credential = payload as Partial<RealtimeCredential> | null;
  if (!credential || typeof credential.value !== "string" || !credential.value) {
    return { ok: false, reason: "unavailable", message: "Voice session could not be prepared. Continue in text mode or try again." };
  }

  // A secret that is already expired, or about to be, would fail negotiation
  // with an opaque WebRTC error. Surface it as a retryable state instead.
  if (typeof credential.expiresAt === "number" && credential.expiresAt <= now() + EXPIRY_MARGIN_SECONDS) {
    return { ok: false, reason: "expired", message: "That voice session expired before it could start. Try again." };
  }

  return {
    ok: true,
    credential: {
      value: credential.value,
      expiresAt: credential.expiresAt,
      model: credential.model ?? "gpt-realtime",
      voice: credential.voice ?? "marin",
    },
  };
}
