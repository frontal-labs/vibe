import {
  CancelledError,
  ConfigError,
  DiCircularDependencyError,
  DiResolutionError,
  LifecycleError,
  NotImplementedError,
  PluginConflictError,
  PluginNotFoundError,
  ProviderAuthError,
  ProviderRateLimitError,
  RuntimeError,
  TimeoutError,
  ToolError,
  ValidationError,
} from "./errors"

export function configError(message: string, cause?: Error): ConfigError {
  return new ConfigError(message, cause)
}

export function runtimeError(message: string, cause?: Error): RuntimeError {
  return new RuntimeError(message, cause)
}

export function providerAuthError(message: string, cause?: Error): ProviderAuthError {
  return new ProviderAuthError(message, cause)
}

export function providerRateLimitError(message: string, cause?: Error): ProviderRateLimitError {
  return new ProviderRateLimitError(message, cause)
}

export function validationError(message: string, cause?: Error): ValidationError {
  return new ValidationError(message, cause)
}

export function toolError(message: string, cause?: Error): ToolError {
  return new ToolError(message, cause)
}

export function timeoutError(message: string, timeoutMs: number, cause?: Error): TimeoutError {
  return new TimeoutError(message, timeoutMs, cause)
}

export function cancelledError(message: string, cause?: Error): CancelledError {
  return new CancelledError(message, cause)
}

export function lifecycleError(message: string, cause?: Error): LifecycleError {
  return new LifecycleError(message, cause)
}

export function notImplementedError(message: string): NotImplementedError {
  return new NotImplementedError(message)
}

export function diResolutionFailed(message: string, cause?: Error): DiResolutionError {
  return new DiResolutionError(message, cause)
}

export function diCircularDependency(message: string, cause?: Error): DiCircularDependencyError {
  return new DiCircularDependencyError(message, cause)
}

export function pluginConflictError(message: string, cause?: Error): PluginConflictError {
  return new PluginConflictError(message, cause)
}

export function pluginNotFoundError(message: string, cause?: Error): PluginNotFoundError {
  return new PluginNotFoundError(message, cause)
}
