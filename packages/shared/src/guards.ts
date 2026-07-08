import type { Nullish } from "./types"

export function assertNever(value: never, message?: string): never {
  throw new TypeError(message ?? `Unexpected value: ${String(value)}`)
}

export function assertDefined<T>(
  value: T,
  message?: string,
): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new TypeError(message ?? "Expected value to be defined")
  }
}

export function isDefined<T>(value: T | Nullish): value is NonNullable<T> {
  return value !== null && value !== undefined
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isString(value: unknown): value is string {
  return typeof value === "string"
}

export function isError(value: unknown): value is Error {
  return value instanceof Error
}

export function isPromise(value: unknown): value is Promise<unknown> {
  return (
    isObject(value) &&
    typeof (value as Record<string, unknown>).then === "function"
  )
}

export function isFunction(
  value: unknown,
): value is (...args: unknown[]) => unknown {
  return typeof value === "function"
}
