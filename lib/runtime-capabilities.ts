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

export const staticDemoNotice =
  "This hosted demo is a static export with no server, so AI-adaptive questions and live voice are unavailable. Run the project locally with an OpenAI API key to enable them.";
