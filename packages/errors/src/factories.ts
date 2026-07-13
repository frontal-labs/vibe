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
import { VibeError } from "./vibe-error"

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

/** Attach an actionable `hint` to an error and return it (chainable). */
export function withHint<E extends VibeError>(error: E, hint: string): E {
  error.hint = hint
  return error
}

/** No agent modules were found under `dir` — with a hint on how to add one. */
export function agentsMissingError(dir: string): ConfigError {
  return withHint(
    configError(`No agents found under ${dir}.`),
    `Add an agent module that default-exports createAgent(...), e.g. ${dir}/assistant.ts.`,
  )
}

/**
 * Render an error as a boxed CLI diagnostic: the message, a `Hint:` line when present, and the
 * error code. Falls back gracefully for non-Vibe errors. No color codes, so it is safe to pipe.
 */
export function formatDiagnostic(error: unknown): string {
  if (VibeError.isVibeError(error)) {
    const lines = [`✗ ${error.message}`]
    if (error.hint) lines.push(`  Hint: ${error.hint}`)
    lines.push(`  Code: ${error.code}`)
    return lines.join("\n")
  }
  const message = error instanceof Error ? error.message : String(error)
  return `✗ ${message}`
}
