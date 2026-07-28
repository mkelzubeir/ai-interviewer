import { describe, expect, it } from "vitest";
import { validateServerEnv } from "./server-env";

describe("server environment validation", () => {
  it("applies defaults when nothing is configured", () => {
    const result = validateServerEnv({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env).toMatchObject({ OPENAI_MODEL: "gpt-5.6-terra", OPENAI_REALTIME_MODEL: "gpt-realtime", OPENAI_REALTIME_VOICE: "marin", OPENAI_REQUEST_TIMEOUT_MS: 15_000 });
    expect(result.env.OPENAI_API_KEY).toBeUndefined();
  });

  it("treats an empty variable in .env the same as an unset one", () => {
    // .env.example ships `OPENAI_REALTIME_VOICE=`, which arrives as "".
    const result = validateServerEnv({ OPENAI_REALTIME_VOICE: "", OPENAI_API_KEY: "  " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.OPENAI_REALTIME_VOICE).toBe("marin");
    expect(result.env.OPENAI_API_KEY).toBeUndefined();
  });

  it("keeps explicit overrides", () => {
    const result = validateServerEnv({ OPENAI_MODEL: "gpt-5.1", OPENAI_REQUEST_TIMEOUT_MS: "30000" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.OPENAI_MODEL).toBe("gpt-5.1");
    expect(result.env.OPENAI_REQUEST_TIMEOUT_MS).toBe(30_000);
  });

  it("reports a truncated API key instead of attempting a doomed request", () => {
    const result = validateServerEnv({ OPENAI_API_KEY: "sk-short" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.join(" ")).toMatch(/OPENAI_API_KEY/);
  });

  it("rejects an unusable timeout", () => {
    expect(validateServerEnv({ OPENAI_REQUEST_TIMEOUT_MS: "-1" }).ok).toBe(false);
    expect(validateServerEnv({ OPENAI_REQUEST_TIMEOUT_MS: "not-a-number" }).ok).toBe(false);
  });
});
