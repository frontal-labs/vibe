import { createRequire } from "node:module"

export interface JsNativeCancellationToken {
  isCancelled: () => boolean
  childToken: () => JsNativeCancellationToken
}

export interface JsNativeCancellationTokenSource {
  token: () => JsNativeCancellationToken
  cancel: () => void
}

export interface JsNativeExecutionEngine {
  registerTask: (
    taskId: string,
    name: string,
    description: string | null,
    maxRetries: number,
    timeoutMs: number | null,
  ) => void
  execute: (taskId: string, inputJson: string) => Promise<JsNativeExecutionResult>
  cancel: (executionId: string) => void
  getExecutionState: (executionId: string) => string
}

export interface JsNativeExecutionResult {
  executionId: string
  state: string
  output: string | undefined
  error: string | undefined
}

export interface JsNativeRetryPolicy {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
}

export interface NativeAddon {
  toolEdges?: (source: string, marker: string) => string
  countText?: (text: string, family: string) => number
  countMessages?: (messagesJson: string, family: string) => number[]
  sseFold?: (body: string) => string
  version?: () => string
  getVersion?: () => string

  generateExecutionId?: () => string
  generateTaskId?: () => string
  generateCheckpointId?: () => string

  JsCancellationTokenSource?: { new (): JsNativeCancellationTokenSource }
  JsCancellationToken?: { new (): JsNativeCancellationToken }
  JsExecutionEngine?: { new (): JsNativeExecutionEngine }
  JsRetryPolicy?: {
    new (
      maxAttempts: number,
      baseDelayMs: number,
      maxDelayMs: number,
      backoffMultiplier: number,
    ): JsNativeRetryPolicy
  }

  defaultRetryPolicy?: () => JsNativeRetryPolicy
  calculateBackoff?: (attempt: number, policy: JsNativeRetryPolicy) => number

  validateToolInput?: (schema: string, input: string) => void
  serializeError?: (message: string, code: string) => string
  countTokens?: (text: string, modelFamily: string) => number
}

export interface JsCancellationToken {
  isCancelled: () => boolean
  childToken: () => JsCancellationToken
}

export interface JsCancellationTokenSource {
  token: () => JsCancellationToken
  cancel: () => void
}

let checked = false
let addon: NativeAddon | null = null

function resolveRequire(): (id: string) => unknown {
  const base = typeof import.meta.url === "string" ? import.meta.url : `${process.cwd()}/`
  return createRequire(base)
}

export function nativeAddon(): NativeAddon | null {
  if (!checked) {
    checked = true
    const path = process.env.VIBE_NATIVE_ADDON
    if (path) {
      try {
        addon = resolveRequire()(path) as NativeAddon
      } catch {
        addon = null
      }
    }
  }
  return addon
}

export function resetNativeAddonCache(): void {
  checked = false
  addon = null
}
