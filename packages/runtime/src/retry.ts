import { cancelledError, timeoutError } from "@vibe/errors"

import type { CancellationToken, RetryPolicy } from "./types"

export function defaultRetryPolicy(): RetryPolicy {
  return {
    maxAttempts: 3,
    initialDelayMs: 200,
    maxDelayMs: 10_000,
    backoffMultiplier: 2,
  }
}

export function calculateDelay(attempt: number, policy: RetryPolicy): number {
  const delay = policy.initialDelayMs * policy.backoffMultiplier ** (attempt - 1)
  const jitter = Math.random() * delay * 0.1
  return Math.min(delay + jitter, policy.maxDelayMs)
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    // biome-ignore lint/complexity/useLiteralKeys: TS4111 requires bracket access for index signatures
    (error as Record<string, unknown>)["name"] === "CancelledError"
  ) {
    return false
  }
  if (typeof error === "object" && error !== null && "retryable" in error) {
    // biome-ignore lint/complexity/useLiteralKeys: TS4111 requires bracket access for index signatures
    return (error as Record<string, unknown>)["retryable"] !== false
  }
  return true
}

export interface RetryableOptions {
  policy: RetryPolicy
  cancellationToken: CancellationToken
  onAttempt?: (attempt: number, error: unknown) => void
  timeoutMs: number | undefined
}

export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryableOptions,
): Promise<T> {
  const { policy, cancellationToken, onAttempt, timeoutMs } = options
  let lastError: unknown

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    cancellationToken.throwIfCancelled()

    try {
      const result = await executeWithTimeout(fn, timeoutMs, cancellationToken)
      return result
    } catch (error) {
      cancellationToken.throwIfCancelled()

      lastError = error

      if (!isRetryableError(error)) {
        throw error
      }

      if (attempt < policy.maxAttempts) {
        onAttempt?.(attempt, error)
        const delay = calculateDelay(attempt, policy)
        await sleep(delay, cancellationToken)
      }
    }
  }

  throw lastError
}

async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number | undefined,
  cancellationToken: CancellationToken,
): Promise<T> {
  if (timeoutMs === undefined) {
    return fn()
  }

  const source = createAbortController()
  const cleanup = cancellationToken.onCancelled(() => source.abort())

  try {
    const result = await raceWithTimeout(fn(), timeoutMs, source.signal)
    return result
  } finally {
    cleanup()
  }
}

function createAbortController(): AbortController {
  return new AbortController()
}

function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(timeoutError("Execution timed out", timeoutMs))
    }, timeoutMs)

    const onAbort = () => {
      clearTimeout(timer)
      reject(cancelledError("Execution cancelled"))
    }

    if (signal.aborted) {
      clearTimeout(timer)
      reject(cancelledError("Execution cancelled"))
      return
    }

    signal.addEventListener("abort", onAbort, { once: true })

    promise
      .then((value) => {
        clearTimeout(timer)
        signal.removeEventListener("abort", onAbort)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        signal.removeEventListener("abort", onAbort)
        reject(error)
      })
  })
}

function sleep(ms: number, cancellationToken: CancellationToken): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)

    const cleanup = cancellationToken.onCancelled(() => {
      clearTimeout(timer)
      reject(cancelledError("Execution cancelled during retry delay"))
    })
  })
}
