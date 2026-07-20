import { isError } from "vibe/shared"

import type { ErrorCode } from "./error-codes"
import type { ErrorFactoryOptions, ErrorSerialized } from "./types"

export class VibeError extends Error {
  readonly code: ErrorCode
  readonly fatal: boolean
  readonly retryable: boolean
  override readonly cause: Error | undefined
  /**
   * An actionable next step for a human ("Did you forget to…?"). Diagnostic-quality tools (the CLI)
   * render this below the message; it never affects control flow. Set via `withHint`.
   */
  hint?: string

  constructor(options: ErrorFactoryOptions) {
    super(options.message, options.cause ? { cause: options.cause } : undefined)
    this.name = "VibeError"
    this.code = options.code
    this.fatal = options.fatal ?? false
    this.retryable = options.retryable ?? false
    this.cause = options.cause
    this.hint = options.hint
  }

  toJSON(): ErrorSerialized {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      fatal: this.fatal,
      retryable: this.retryable,
      hint: this.hint,
      stack: this.stack ?? undefined,
      cause: this.cause ? serializeError(this.cause) : undefined,
    }
  }

  static fromJSON(data: ErrorSerialized): VibeError {
    const opts: ErrorFactoryOptions = {
      message: data.message,
      code: data.code,
      fatal: data.fatal,
      retryable: data.retryable,
    }
    if (data.cause) {
      opts.cause = VibeError.fromJSON(data.cause)
    }
    const error = new VibeError(opts)
    error.name = data.name
    error.hint = data.hint
    if (data.stack) {
      error.stack = data.stack
    }
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
    stack: error.stack ?? undefined,
    cause: undefined,
  }
}
