/**
 * Capability detection for builds that ship without a server.
 *
 * The GitHub Pages demo is a static export: there are no route handlers, so the
 * OpenAI Responses adapter and the Realtime client-secret endpoint do not exist.
 * Both values are inlined at build time by `next.config.ts`, so the client never
 * needs — and never receives — anything derived from OPENAI_API_KEY.
 */

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** True when route handlers are part of this build (local dev and `next start`). */
export const hasServerFeatures = process.env.NEXT_PUBLIC_SERVER_FEATURES !== "disabled";

/** Prefix a same-origin path with the deployment basePath. */
export function withBasePath(path: string) {
  if (!path.startsWith("/")) throw new Error(`withBasePath expects a root-relative path, received "${path}"`);
  return `${basePath}${path}`;
}

/**
 * Supabase Edge Function that mints Realtime client secrets, letting the static
 * export run voice mode without a Next.js route. Empty when not configured.
 * This is a public function URL, never a key.
 */
export const realtimeTokenUrl = process.env.NEXT_PUBLIC_REALTIME_TOKEN_URL ?? "";

/** AI-adaptive text turns need the Next.js route; there is no static equivalent. */
export const aiTurnsAvailable = hasServerFeatures;

/** Voice works from either a route handler or the Edge Function. */
export const voiceModeAvailable = hasServerFeatures || Boolean(realtimeTokenUrl);

export const staticDemoNotice =
  "This hosted demo is a static export with no server, so AI-adaptive questions run on the local deterministic engine instead. Run the project locally with an OpenAI API key to enable adaptive questions.";
