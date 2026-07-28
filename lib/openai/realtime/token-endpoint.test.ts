import { describe, expect, it, vi } from "vitest";
import { requestRealtimeCredential, resolveTokenSource, type TokenSource } from "./token-endpoint";

const context = { interviewType: "mixed", roleSummary: "role", candidateSummary: "candidate", competencies: [], claims: [], remainingBudget: 5 };

const nextRoute: TokenSource = { kind: "next-route", url: "/ai-interviewer/api/realtime/session", requiresAuth: false };
const edgeFunction: TokenSource = { kind: "edge-function", url: "https://project.supabase.co/functions/v1/realtime-token", requiresAuth: true };

const NOW = 1_800_000_000;
const now = () => NOW;

function respond(body: unknown, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

function credential(overrides: Record<string, unknown> = {}) {
  return { value: "ek_test_secret", expiresAt: NOW + 120, model: "gpt-realtime", voice: "marin", ...overrides };
}

describe("token source selection", () => {
  it("prefers the route handler when the build has a server", () => {
    const source = resolveTokenSource({ hasServerFeatures: true, routeUrl: "/api/realtime/session", edgeFunctionUrl: "https://project.supabase.co/functions/v1/realtime-token" });
    // Local development must keep working with nothing but OPENAI_API_KEY.
    expect(source).toMatchObject({ kind: "next-route", requiresAuth: false });
  });

  it("falls back to the Edge Function on a static build", () => {
    const source = resolveTokenSource({ hasServerFeatures: false, routeUrl: "/api/realtime/session", edgeFunctionUrl: "https://project.supabase.co/functions/v1/realtime-token" });
    expect(source).toMatchObject({ kind: "edge-function", url: "https://project.supabase.co/functions/v1/realtime-token", requiresAuth: true });
  });

  it("reports no source when a static build has no Edge Function configured", () => {
    expect(resolveTokenSource({ hasServerFeatures: false, routeUrl: "/api/realtime/session", edgeFunctionUrl: "" })).toBeNull();
  });
});

describe("credential request", () => {
  it("posts the session context to the route handler without an Authorization header", async () => {
    const fetchImpl = respond(credential());
    const result = await requestRealtimeCredential({ source: nextRoute, sessionId: "abc", context, fetchImpl, now });

    expect(result).toMatchObject({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(nextRoute.url);
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(String(init?.body))).toMatchObject({ sessionId: "abc", interviewType: "mixed" });
  });

  it("sends the Supabase access token as a bearer token to the Edge Function", async () => {
    const fetchImpl = respond(credential());
    await requestRealtimeCredential({ source: edgeFunction, sessionId: "abc", context, accessToken: "jwt-123", fetchImpl, now });

    const [, init] = fetchImpl.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer jwt-123");
  });

  it("never sends a request to the Edge Function without a token", async () => {
    const fetchImpl = respond(credential());
    const result = await requestRealtimeCredential({ source: edgeFunction, sessionId: "abc", context, accessToken: null, fetchImpl, now });

    expect(result).toMatchObject({ ok: false, reason: "auth-required" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns the validated credential on success", async () => {
    const result = await requestRealtimeCredential({ source: nextRoute, sessionId: "abc", context, fetchImpl: respond(credential()), now });
    expect(result).toEqual({ ok: true, credential: { value: "ek_test_secret", expiresAt: NOW + 120, model: "gpt-realtime", voice: "marin" } });
  });
});

describe("credential error handling", () => {
  it.each([
    [401, "auth-required"],
    [403, "auth-required"],
    [429, "rate-limited"],
    [503, "not-configured"],
    [502, "unavailable"],
    [500, "unavailable"],
  ])("maps status %i to %s", async (status, reason) => {
    const result = await requestRealtimeCredential({ source: nextRoute, sessionId: "abc", context, fetchImpl: respond({ error: "server message" }, status), now });
    expect(result).toMatchObject({ ok: false, reason, message: "server message" });
  });

  it("uses a safe default message when the server sends no usable body", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>gateway error</html>", { status: 502 }));
    const result = await requestRealtimeCredential({ source: nextRoute, sessionId: "abc", context, fetchImpl, now });
    expect(result).toMatchObject({ ok: false, reason: "unavailable" });
    if (result.ok) return;
    expect(result.message).not.toContain("html");
  });

  it("treats a network failure as recoverable rather than throwing", async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    const result = await requestRealtimeCredential({ source: edgeFunction, sessionId: "abc", context, accessToken: "jwt", fetchImpl, now });
    expect(result).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("rejects a 200 response that carries no secret", async () => {
    const result = await requestRealtimeCredential({ source: nextRoute, sessionId: "abc", context, fetchImpl: respond({ model: "gpt-realtime" }), now });
    expect(result).toMatchObject({ ok: false, reason: "unavailable" });
  });
});

describe("credential expiry handling", () => {
  it("rejects a secret that has already expired", async () => {
    const result = await requestRealtimeCredential({ source: nextRoute, sessionId: "abc", context, fetchImpl: respond(credential({ expiresAt: NOW - 1 })), now });
    expect(result).toMatchObject({ ok: false, reason: "expired" });
  });

  it("rejects a secret expiring inside the negotiation margin", async () => {
    // WebRTC negotiation would otherwise fail with an opaque error.
    const result = await requestRealtimeCredential({ source: nextRoute, sessionId: "abc", context, fetchImpl: respond(credential({ expiresAt: NOW + 3 })), now });
    expect(result).toMatchObject({ ok: false, reason: "expired" });
  });

  it("accepts a secret with comfortable headroom", async () => {
    const result = await requestRealtimeCredential({ source: nextRoute, sessionId: "abc", context, fetchImpl: respond(credential({ expiresAt: NOW + 60 })), now });
    expect(result).toMatchObject({ ok: true });
  });

  it("accepts a credential whose expiry the server did not report", async () => {
    const result = await requestRealtimeCredential({ source: nextRoute, sessionId: "abc", context, fetchImpl: respond(credential({ expiresAt: null })), now });
    expect(result).toMatchObject({ ok: true });
  });
});
