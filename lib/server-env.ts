import { z } from "zod";

/**
 * Server-only environment validation.
 *
 * Never import this from a client component: it reads secrets. Validation is
 * total rather than throwing, so a misconfigured environment disables the
 * optional OpenAI modes and leaves the deterministic engine working instead of
 * breaking the app at import time.
 */

/** Treat an unset variable and an empty one (`FOO=` in .env) as the same thing. */
function optional(fallback: string) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().min(1).default(fallback),
  );
}

const serverEnvSchema = z.object({
  OPENAI_API_KEY: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().min(20, "OPENAI_API_KEY is present but too short to be a real key.").optional(),
  ),
  OPENAI_MODEL: optional("gpt-5.6-terra"),
  OPENAI_REALTIME_MODEL: optional("gpt-realtime"),
  OPENAI_REALTIME_VOICE: optional("marin"),
  OPENAI_REQUEST_TIMEOUT_MS: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.coerce.number().int().positive().max(120_000).default(15_000),
  ),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ServerEnvResult = { ok: true; env: ServerEnv } | { ok: false; issues: string[] };

export function validateServerEnv(source: Record<string, string | undefined>): ServerEnvResult {
  const parsed = serverEnvSchema.safeParse(source);
  if (parsed.success) return { ok: true, env: parsed.data };
  return { ok: false, issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`) };
}

let cached: ServerEnvResult | null = null;

/** Validated process env, computed once per server process. */
export function serverEnv(): ServerEnvResult {
  cached ??= validateServerEnv(process.env);
  return cached;
}

/** AI and voice modes are available only when the env is valid *and* a key is set. */
export function openAIEnv(): ServerEnv | null {
  const result = serverEnv();
  return result.ok && result.env.OPENAI_API_KEY ? result.env : null;
}

/** Test-only: drop the memoized result. */
export function resetServerEnvCache() {
  cached = null;
}
