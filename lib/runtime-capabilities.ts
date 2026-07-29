/**
 * Capability detection for builds that ship without a server.
 *
 * The GitHub Pages demo is a static export: there are no route handlers, so the
 * Realtime client-secret endpoint does not exist in it. Minting moves to a
 * Supabase Edge Function instead. Values are inlined at build time by
 * `next.config.ts`, so the client never needs — and never receives — anything
 * derived from OPENAI_API_KEY.
 */

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** True when route handlers are part of this build (local dev and `next start`). */
export const hasServerFeatures = process.env.NEXT_PUBLIC_SERVER_FEATURES !== "disabled";

/**
 * Supabase Edge Function that mints Realtime client secrets, which is how voice
 * runs on the static export. A public function URL, never a key.
 */
export const realtimeTokenUrl = process.env.NEXT_PUBLIC_REALTIME_TOKEN_URL ?? "";

/** Voice works from either a route handler or the Edge Function. */
export const voiceModeAvailable = hasServerFeatures || Boolean(realtimeTokenUrl);

/**
 * True when the only token source is the public Edge Function, which mints
 * secrets for an authenticated user only. A local server build needs no session.
 */
export const voiceNeedsSession = !hasServerFeatures && Boolean(realtimeTokenUrl);

/** Prefix a same-origin path with the deployment basePath. */
export function withBasePath(path: string) {
  if (!path.startsWith("/")) throw new Error(`withBasePath expects a root-relative path, received "${path}"`);
  return `${basePath}${path}`;
}

/**
 * Shown when this deployment cannot start a spoken interview at all. The app is
 * voice-only, so this is a hard stop rather than a quiet downgrade.
 */
export const voiceUnavailableNotice =
  "Voice mode is not configured on this deployment. Run the project locally with an OpenAI API key, or set NEXT_PUBLIC_REALTIME_TOKEN_URL to a deployed realtime-token function.";
