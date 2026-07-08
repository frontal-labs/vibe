import { ErrorCode } from "./error-codes"
import { VibeError } from "./vibe-error"

export class ConfigError extends VibeError {
  constructor(message: string, cause?: Error) {
    super({
      message,
      code: ErrorCode.ConfigInvalid,
      fatal: true,
      retryable: false,
      cause,
    })
    this.name = "ConfigError"
  }
}

export class RuntimeError extends VibeError {
  constructor(message: string, cause?: Error) {
    super({
      message,
      code: ErrorCode.RuntimePanic,
      fatal: true,
      retryable: true,
      cause,
    })
    this.name = "RuntimeError"
  }
}

export class ProviderError extends VibeError {
  constructor(message: string, cause?: Error) {
    super({
      message,
      code: ErrorCode.ProviderUnavailable,
      fatal: false,
      retryable: true,
      cause,
    })
    this.name = "ProviderError"
  }
}

export class ProviderAuthError extends VibeError {
  constructor(message: string, cause?: Error) {
    super({
      message,
      code: ErrorCode.ProviderAuthFailed,
      fatal: true,
      retryable: false,
      cause,
    })
    this.name = "ProviderAuthError"
  }
}

export class ProviderRateLimitError extends VibeError {
  constructor(message: string, cause?: Error) {
    super({
      message,
      code: ErrorCode.ProviderRateLimited,
      fatal: false,
      retryable: true,
      cause,
    })
    this.name = "ProviderRateLimitError"
  }
}

export class ValidationError extends VibeError {
  constructor(message: string, cause?: Error) {
    super({
      message,
      code: ErrorCode.ValidationFailed,
      fatal: false,
      retryable: false,
      cause,
    })
    this.name = "ValidationError"
  }
}

export class ToolError extends VibeError {
  constructor(message: string, cause?: Error) {
    super({
      message,
      code: ErrorCode.ToolExecutionFailed,
      fatal: false,
      retryable: true,
      cause,
    })
    this.name = "ToolError"
  }
}

export class TimeoutError extends VibeError {
  readonly timeoutMs: number

  constructor(message: string, timeoutMs: number, cause?: Error) {
    super({
      message,
      code: ErrorCode.Timeout,
      fatal: false,
      retryable: true,
      cause,
    })
    this.name = "TimeoutError"
    this.timeoutMs = timeoutMs
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      timeoutMs: this.timeoutMs,
    }
  }
}

export class CancelledError extends VibeError {
  constructor(message: string, cause?: Error) {
    super({
      message,
      code: ErrorCode.Cancelled,
      fatal: false,
      retryable: false,
      cause,
    })
    this.name = "CancelledError"
  }
}

export class LifecycleError extends VibeError {
  constructor(message: string, cause?: Error) {
    super({
      message,
      code: ErrorCode.LifecycleInvalidTransition,
      fatal: true,
      retryable: false,
      cause,
    })
    this.name = "LifecycleError"
  }
}

export class NotImplementedError extends VibeError {
  constructor(message: string) {
    super({
      message,
      code: ErrorCode.NotImplemented,
      fatal: true,
      retryable: false,
    })
    this.name = "NotImplementedError"
  }
}

export class DiResolutionError extends VibeError {
  constructor(message: string, cause?: Error) {
    super({
      message,
      code: ErrorCode.DiResolutionFailed,
      fatal: true,
      retryable: false,
      cause,
    })
    this.name = "DiResolutionError"
  }
}

export class DiCircularDependencyError extends VibeError {
  constructor(message: string, cause?: Error) {
    super({
      message,
      code: ErrorCode.DiCircularDependency,
      fatal: true,
      retryable: false,
      cause,
    })
    this.name = "DiCircularDependencyError"
  }
}

export class PluginConflictError extends VibeError {
  constructor(message: string, cause?: Error) {
    super({
      message,
      code: ErrorCode.PluginConflict,
      fatal: true,
      retryable: false,
      cause,
    })
    this.name = "PluginConflictError"
  }
}

export class PluginNotFoundError extends VibeError {
  constructor(message: string, cause?: Error) {
    super({
      message,
      code: ErrorCode.PluginNotFound,
      fatal: false,
      retryable: false,
      cause,
    })
    this.name = "PluginNotFoundError"
  }
}
