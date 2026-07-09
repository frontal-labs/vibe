import { ErrorCode } from "./error-codes"
import type { ErrorFactoryOptions } from "./types"
import { VibeError } from "./vibe-error"

function makeOptions(
  message: string,
  code: ErrorCode,
  fatal: boolean,
  retryable: boolean,
  cause?: Error,
): ErrorFactoryOptions {
  const opts: ErrorFactoryOptions = { message, code, fatal, retryable }
  if (cause) {
    opts.cause = cause
  }
  return opts
}

export class ConfigError extends VibeError {
  constructor(message: string, cause?: Error) {
    super(makeOptions(message, ErrorCode.ConfigInvalid, true, false, cause))
    this.name = "ConfigError"
  }
}

export class RuntimeError extends VibeError {
  constructor(message: string, cause?: Error) {
    super(makeOptions(message, ErrorCode.RuntimePanic, true, true, cause))
    this.name = "RuntimeError"
  }
}

export class ProviderError extends VibeError {
  constructor(message: string, cause?: Error) {
    super(makeOptions(message, ErrorCode.ProviderUnavailable, false, true, cause))
    this.name = "ProviderError"
  }
}

export class ProviderAuthError extends VibeError {
  constructor(message: string, cause?: Error) {
    super(makeOptions(message, ErrorCode.ProviderAuthFailed, true, false, cause))
    this.name = "ProviderAuthError"
  }
}

export class ProviderRateLimitError extends VibeError {
  constructor(message: string, cause?: Error) {
    super(makeOptions(message, ErrorCode.ProviderRateLimited, false, true, cause))
    this.name = "ProviderRateLimitError"
  }
}

export class ValidationError extends VibeError {
  constructor(message: string, cause?: Error) {
    super(makeOptions(message, ErrorCode.ValidationFailed, false, false, cause))
    this.name = "ValidationError"
  }
}

export class ToolError extends VibeError {
  constructor(message: string, cause?: Error) {
    super(makeOptions(message, ErrorCode.ToolExecutionFailed, false, true, cause))
    this.name = "ToolError"
  }
}

export class TimeoutError extends VibeError {
  readonly timeoutMs: number

  constructor(message: string, timeoutMs: number, cause?: Error) {
    super(makeOptions(message, ErrorCode.Timeout, false, true, cause))
    this.name = "TimeoutError"
    this.timeoutMs = timeoutMs
  }

  override toJSON() {
    return { ...super.toJSON(), timeoutMs: this.timeoutMs }
  }
}

export class CancelledError extends VibeError {
  constructor(message: string, cause?: Error) {
    super(makeOptions(message, ErrorCode.Cancelled, false, false, cause))
    this.name = "CancelledError"
  }
}

export class LifecycleError extends VibeError {
  constructor(message: string, cause?: Error) {
    super(makeOptions(message, ErrorCode.LifecycleInvalidTransition, true, false, cause))
    this.name = "LifecycleError"
  }
}

export class NotImplementedError extends VibeError {
  constructor(message: string) {
    super(makeOptions(message, ErrorCode.NotImplemented, true, false))
    this.name = "NotImplementedError"
  }
}

export class DiResolutionError extends VibeError {
  constructor(message: string, cause?: Error) {
    super(makeOptions(message, ErrorCode.DiResolutionFailed, true, false, cause))
    this.name = "DiResolutionError"
  }
}

export class DiCircularDependencyError extends VibeError {
  constructor(message: string, cause?: Error) {
    super(makeOptions(message, ErrorCode.DiCircularDependency, true, false, cause))
    this.name = "DiCircularDependencyError"
  }
}

export class PluginConflictError extends VibeError {
  constructor(message: string, cause?: Error) {
    super(makeOptions(message, ErrorCode.PluginConflict, true, false, cause))
    this.name = "PluginConflictError"
  }
}

export class PluginNotFoundError extends VibeError {
  constructor(message: string, cause?: Error) {
    super(makeOptions(message, ErrorCode.PluginNotFound, false, false, cause))
    this.name = "PluginNotFoundError"
  }
}
