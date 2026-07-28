/**
 * CORS allowlist for the realtime-token function.
 *
 * Exact-origin matching only: the browser must be on the deployed demo or a
 * local dev server. Anything else gets no CORS headers, so a page on another
 * origin cannot read the response even if it reaches the function.
 *
 * Pure and import-free so it is unit-testable under vitest and bundleable by Deno.
 */

export const ALLOWED_ORIGINS = ["https://mkelzubeir.github.io", "http://localhost:3000"] as const;

export function isAllowedOrigin(origin: string | null): origin is string {
  return typeof origin === "string" && (ALLOWED_ORIGINS as readonly string[]).includes(origin);
}

/**
 * Headers for an allowed origin, or null when the origin is not allowlisted.
 * `Vary: Origin` keeps a shared cache from serving one origin's headers to another.
 */
export function corsHeaders(origin: string | null): Record<string, string> | null {
  if (!isAllowedOrigin(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "3600",
    Vary: "Origin",
  };
}
