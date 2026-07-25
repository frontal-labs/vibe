export { ErrorCode } from "./error-codes"
export {
  CancelledError,
  ConfigError,
  DiCircularDependencyError,
  DiResolutionError,
  LifecycleError,
  NotImplementedError,
  PluginConflictError,
  PluginNotFoundError,
  ProviderAuthError,
  ProviderError,
  ProviderRateLimitError,
  RuntimeError,
  TimeoutError,
  ToolError,
  ValidationError,
} from "./errors"
export {
  agentsMissingError,
  cancelledError,
  configError,
  diCircularDependency,
  diResolutionFailed,
  formatDiagnostic,
  lifecycleError,
  notImplementedError,
  pluginConflictError,
  pluginNotFoundError,
  providerAuthError,
  providerRateLimitError,
  runtimeError,
  timeoutError,
  toolError,
  validationError,
  withHint,
} from "./factories"
export type { ErrorFactoryOptions, ErrorSerialized } from "./types"
export { VibeError } from "./vibe-error"

import { nativeAddon } from "vibe/shared"

export function serializeError(message: string, code: string): string {
  const addon = nativeAddon()
  if (addon?.serializeError) {
    return addon.serializeError(message, code)
  }
  return JSON.stringify({ message, code })
}
