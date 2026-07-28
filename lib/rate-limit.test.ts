import { describe, expect, it } from "vitest";
import { clientKey, createRateLimiter } from "./rate-limit";

describe("rate limiter", () => {
  it("allows up to the limit within a window and blocks the next request", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => 1_000 });
    expect([limiter.check("a"), limiter.check("a"), limiter.check("a")]).toEqual([true, true, true]);
    expect(limiter.check("a")).toBe(false);
  });

  it("tracks callers independently", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 1_000 });
    expect(limiter.check("a")).toBe(true);
    expect(limiter.check("b")).toBe(true);
    expect(limiter.check("a")).toBe(false);
  });

  it("recovers once the window has passed", () => {
    let time = 1_000;
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => time });
    expect(limiter.check("a")).toBe(true);
    expect(limiter.check("a")).toBe(false);
    time += 60_001;
    expect(limiter.check("a")).toBe(true);
  });

  it("evicts expired keys so a long-lived process does not grow without bound", () => {
    let time = 1_000;
    const limiter = createRateLimiter({ limit: 5, windowMs: 1_000, now: () => time, maxKeys: 10 });
    for (let i = 0; i < 10; i += 1) limiter.check(`caller-${i}`);
    expect(limiter.size()).toBe(10);
    time += 5_000;
    limiter.check("fresh");
    expect(limiter.size()).toBe(1);
  });

  it("derives a caller key from the first forwarded address", () => {
    expect(clientKey("203.0.113.7, 70.41.3.18")).toBe("203.0.113.7");
    expect(clientKey(null)).toBe("local");
    expect(clientKey("  ")).toBe("local");
  });
});
