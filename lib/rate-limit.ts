/**
 * Fixed-window per-key rate limiter for route handlers.
 *
 * Entries are evicted once they fall out of the window, so a long-lived server
 * process does not accumulate a map entry per client address forever.
 */
export type RateLimiter = { check(key: string): boolean; size(): number };

export function createRateLimiter(options: { limit: number; windowMs: number; now?: () => number; maxKeys?: number }): RateLimiter {
  const { limit, windowMs, now = Date.now, maxKeys = 1000 } = options;
  const hits = new Map<string, number[]>();

  function evictExpired(cutoff: number) {
    for (const [key, times] of hits) {
      const live = times.filter((time) => time > cutoff);
      if (live.length) hits.set(key, live);
      else hits.delete(key);
    }
  }

  return {
    check(key: string) {
      const time = now();
      const cutoff = time - windowMs;
      // Sweeping only when the map has grown keeps the common path O(1) while
      // still bounding memory for a process that sees many distinct clients.
      if (hits.size >= maxKeys) evictExpired(cutoff);

      const recent = (hits.get(key) ?? []).filter((entry) => entry > cutoff);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(time);
      hits.set(key, recent);
      return true;
    },
    size() {
      return hits.size;
    },
  };
}

/** Best-effort client identity for local dev and single-instance hosting. */
export function clientKey(forwardedFor: string | null) {
  return forwardedFor?.split(",")[0]?.trim() || "local";
}
