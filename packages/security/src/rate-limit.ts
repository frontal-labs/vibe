export interface RateLimitOptions {
  /** Max allowed events per window. */
  readonly limit: number
  /** Window length in milliseconds. */
  readonly windowMs: number
}

export interface RateLimiter {
  /** Try to consume one unit for `key`; false when the window budget is exhausted. */
  tryAcquire(key: string): boolean
  /** Remaining budget for `key` in the current window. */
  remaining(key: string): number
  reset(key: string): void
}

interface Bucket {
  count: number
  windowStart: number
}

/**
 * A per-key fixed-window rate limiter for per-tenant/per-actor throttling. Pass a
 * `now` for deterministic tests. Complements the runtime `ResourceManager` (which
 * caps concurrency) by capping request *rate*.
 */
export function createRateLimiter(
  options: RateLimitOptions,
  now: () => number = () => Date.now(),
): RateLimiter {
  const buckets = new Map<string, Bucket>()

  function current(key: string): Bucket {
    const t = now()
    const bucket = buckets.get(key)
    if (!bucket || t - bucket.windowStart >= options.windowMs) {
      const fresh = { count: 0, windowStart: t }
      buckets.set(key, fresh)
      return fresh
    }
    return bucket
  }

  return {
    tryAcquire: (key) => {
      const bucket = current(key)
      if (bucket.count >= options.limit) return false
      bucket.count += 1
      return true
    },
    remaining: (key) => Math.max(0, options.limit - current(key).count),
    reset: (key) => {
      buckets.delete(key)
    },
  }
}
