import type { ErrorCode } from "./error-codes"

export interface ErrorSerialized {
  readonly name: string
  readonly message: string
  readonly code: ErrorCode
  readonly fatal: boolean
  readonly retryable: boolean
  readonly stack: string | undefined
  readonly cause: ErrorSerialized | undefined
}

export interface ErrorFactoryOptions {
  message: string
  code: ErrorCode
  fatal?: boolean
  retryable?: boolean
  cause?: Error
}
