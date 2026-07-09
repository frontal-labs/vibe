import { describe, expect, it, vi } from "vitest"

import { createCancellationTokenSource } from "../src/cancellation"
import {
  calculateDelay,
  defaultRetryPolicy,
  executeWithRetry,
  isRetryableError,
} from "../src/retry"

describe("defaultRetryPolicy", () => {
  it("should return sensible defaults", () => {
    const policy = defaultRetryPolicy()
    expect(policy.maxAttempts).toBe(3)
    expect(policy.initialDelayMs).toBe(200)
    expect(policy.maxDelayMs).toBe(10_000)
    expect(policy.backoffMultiplier).toBe(2)
  })
})

describe("calculateDelay", () => {
  it("should increase delay with each attempt", () => {
    const policy = defaultRetryPolicy()
    const d1 = calculateDelay(1, policy)
    const d2 = calculateDelay(2, policy)
    const d3 = calculateDelay(3, policy)
    expect(d2).toBeGreaterThan(d1)
    expect(d3).toBeGreaterThan(d2)
  })

  it("should not exceed maxDelayMs", () => {
    const policy = { ...defaultRetryPolicy(), maxDelayMs: 500 }
    const delay = calculateDelay(10, policy)
    expect(delay).toBeLessThanOrEqual(500)
  })
})

describe("isRetryableError", () => {
  it("should return true for regular errors", () => {
    expect(isRetryableError(new Error("something"))).toBe(true)
  })

  it("should return false for cancelled errors", () => {
    const err = new Error("cancelled")
    err.name = "CancelledError"
    expect(isRetryableError(err)).toBe(false)
  })

  it("should return false for AbortError", () => {
    const err = new DOMException("aborted", "AbortError")
    expect(isRetryableError(err)).toBe(false)
  })
})

describe("executeWithRetry", () => {
  it("should succeed on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("success")
    const source = createCancellationTokenSource()

    const result = await executeWithRetry(fn, {
      policy: defaultRetryPolicy(),
      cancellationToken: source.token,
    })

    expect(result).toBe("success")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("should retry on failure and succeed", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockResolvedValueOnce("success")
    const source = createCancellationTokenSource()

    const result = await executeWithRetry(fn, {
      policy: defaultRetryPolicy(),
      cancellationToken: source.token,
    })

    expect(result).toBe("success")
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("should throw after exhausting retries", async () => {
    const error = new Error("persistent")
    const fn = vi.fn().mockRejectedValue(error)
    const source = createCancellationTokenSource()

    await expect(
      executeWithRetry(fn, {
        policy: { ...defaultRetryPolicy(), maxAttempts: 2 },
        cancellationToken: source.token,
      }),
    ).rejects.toThrow("persistent")

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("should not retry if cancelled", async () => {
    const source = createCancellationTokenSource()
    const fn = vi.fn().mockRejectedValue(new Error("fail"))

    source.cancel()

    await expect(
      executeWithRetry(fn, {
        policy: defaultRetryPolicy(),
        cancellationToken: source.token,
      }),
    ).rejects.toThrow()

    expect(fn).toHaveBeenCalledTimes(0)
  })

  it("should respect timeout", async () => {
    const source = createCancellationTokenSource()
    const fn = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 500)))

    const result = executeWithRetry(fn, {
      policy: defaultRetryPolicy(),
      cancellationToken: source.token,
      timeoutMs: 10,
    })

    await expect(result).rejects.toThrow("timed out")
  })

  it("should call onAttempt callback", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("first")).mockResolvedValueOnce("ok")
    const source = createCancellationTokenSource()
    const onAttempt = vi.fn()

    await executeWithRetry(fn, {
      policy: defaultRetryPolicy(),
      cancellationToken: source.token,
      onAttempt,
    })

    expect(onAttempt).toHaveBeenCalledTimes(1)
    expect(onAttempt).toHaveBeenCalledWith(1, expect.any(Error))
  })
})
