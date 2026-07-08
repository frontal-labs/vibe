import { isError } from "@vibe/shared"

import type { ErrorCode } from "./error-codes"
import type { ErrorFactoryOptions, ErrorSerialized } from "./types"

export class VibeError extends Error {
  readonly code: ErrorCode
  readonly fatal: boolean
  readonly retryable: boolean
  override readonly cause?: Error

  constructor(options: ErrorFactoryOptions) {
    super(options.message, options.cause ? { cause: options.cause } : undefined)
    this.name = "VibeError"
    this.code = options.code
    this.fatal = options.fatal ?? false
    this.retryable = options.retryable ?? false
    this.cause = options.cause
  }

  toJSON(): ErrorSerialized {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      fatal: this.fatal,
      retryable: this.retryable,
      stack: this.stack,
      cause: this.cause ? serializeError(this.cause) : undefined,
    }
  }

  static fromJSON(data: ErrorSerialized): VibeError {
    const error = new VibeError({
      message: data.message,
      code: data.code,
      fatal: data.fatal,
      retryable: data.retryable,
      cause: data.cause ? VibeError.fromJSON(data.cause) : undefined,
    })
    error.name = data.name
    error.stack = data.stack
    return error
  }

  static isVibeError(value: unknown): value is VibeError {
    return isError(value) && "code" in value && "fatal" in value && "retryable" in value
  }
}

function serializeError(error: Error): ErrorSerialized {
  if (VibeError.isVibeError(error)) {
    return error.toJSON()
  }
  return {
    name: error.name ?? "Error",
    message: error.message,
    code: "VIBE_INTERNAL_ERROR" as ErrorCode,
    fatal: false,
    retryable: false,
    stack: error.stack,
  }
}
