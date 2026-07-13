import type { ErrorCode } from "./error-codes"

export interface ErrorSerialized {
  readonly name: string
  readonly message: string
  readonly code: ErrorCode
  readonly fatal: boolean
  readonly retryable: boolean
  readonly hint?: string | undefined
  readonly stack: string | undefined
  readonly cause: ErrorSerialized | undefined
}

export interface ErrorFactoryOptions {
  message: string
  code: ErrorCode
  fatal?: boolean
  retryable?: boolean
  /** An actionable next step surfaced to humans by diagnostic tools. */
  hint?: string
  cause?: Error
}
