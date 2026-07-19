---
title: "Errors — `vibe/errors`"
description: "Vibe's error model has one principle: **errors are values with codes.** Every"
---

# Errors — `vibe/errors`

Vibe's error model has one principle: **errors are values with codes.** Every
failure is a `VibeError` subclass carrying a machine-readable `ErrorCode`, boolean
`fatal`/`retryable` flags, an optional `cause` chain, and a JSON serialization.
Retry logic, telemetry, and user messaging branch on the **code and flags**, never
on a parsed message string. `vibe/errors` sits just above `vibe/shared` so every
layer above it can throw typed — there is never an excuse for `throw new Error()`
in library code.

## `VibeError` — the base

```ts
export class VibeError extends Error {
  readonly code: ErrorCode
  readonly fatal: boolean
  readonly retryable: boolean
  override readonly cause: Error | undefined

  constructor(options: ErrorFactoryOptions) { … }

  toJSON(): ErrorSerialized
  static fromJSON(data: ErrorSerialized): VibeError
  static isVibeError(value: unknown): value is VibeError
}
```

Three fields do the work:

- **`code`** — an `ErrorCode` enum member (below). The stable, machine-readable
  discriminant.
- **`retryable`** — whether a retry could plausibly succeed. This is the exact flag
  the [runtime's `isRetryableError`](./05-runtime-execution.md#what-counts-as-retryable)
  reads: `retryable !== false` ⇒ back off and retry; `false` ⇒ fail fast.
- **`fatal`** — whether the failure should tear the system down vs. be handled
  locally. Config/lifecycle/DI errors are fatal; a provider blip or tool failure is
  not.

### Serialization: errors cross process boundaries

`toJSON()` produces a fully serializable `ErrorSerialized`, recursively serializing
the `cause` chain:

```ts
export interface ErrorSerialized {
  readonly name: string
  readonly message: string
  readonly code: ErrorCode
  readonly fatal: boolean
  readonly retryable: boolean
  readonly stack: string | undefined
  readonly cause: ErrorSerialized | undefined
}
```

`VibeError.fromJSON(data)` reconstructs a `VibeError` (including the nested cause),
and `VibeError.isVibeError(value)` is a structural guard (checks for `code`,
`fatal`, `retryable`). A non-`VibeError` cause is wrapped with code
`VIBE_INTERNAL_ERROR` during serialization, so the chain is always uniform. This is
why errors survive the [runtime](./05-runtime-execution.md) (which stores a
`SerializedError` on `ExecutionResult`) and any future transport — the code and
flags travel with the error.

## Error codes

```ts
export enum ErrorCode {
  ConfigInvalid              = "VIBE_CONFIG_INVALID",
  RuntimePanic               = "VIBE_RUNTIME_PANIC",
  ProviderUnavailable        = "VIBE_PROVIDER_UNAVAILABLE",
  ProviderAuthFailed         = "VIBE_PROVIDER_AUTH_FAILED",
  ProviderRateLimited        = "VIBE_PROVIDER_RATE_LIMITED",
  ValidationFailed           = "VIBE_VALIDATION_FAILED",
  ToolExecutionFailed        = "VIBE_TOOL_EXECUTION_FAILED",
  Timeout                    = "VIBE_TIMEOUT",
  Cancelled                  = "VIBE_CANCELLED",
  LifecycleInvalidTransition = "VIBE_LIFECYCLE_INVALID_TRANSITION",
  PluginConflict             = "VIBE_PLUGIN_CONFLICT",
  PluginNotFound             = "VIBE_PLUGIN_NOT_FOUND",
  DiResolutionFailed         = "VIBE_DI_RESOLUTION_FAILED",
  DiCircularDependency       = "VIBE_DI_CIRCULAR_DEPENDENCY",
  NotImplemented             = "VIBE_NOT_IMPLEMENTED",
  InternalError              = "VIBE_INTERNAL_ERROR",
}
```

The `VIBE_` prefix keeps them greppable and namespaced. Codes are the contract:
callers switch on them; they never change silently.

## The error classes

Each subclass fixes its `code` and its `fatal`/`retryable` defaults, so you get
correct semantics just by constructing the right type:

| Class | Code | `fatal` | `retryable` |
|---|---|---|---|
| `ConfigError` | `VIBE_CONFIG_INVALID` | ✅ | ❌ |
| `RuntimeError` | `VIBE_RUNTIME_PANIC` | ✅ | ✅ |
| `ProviderError` | `VIBE_PROVIDER_UNAVAILABLE` | ❌ | ✅ |
| `ProviderAuthError` | `VIBE_PROVIDER_AUTH_FAILED` | ✅ | ❌ |
| `ProviderRateLimitError` | `VIBE_PROVIDER_RATE_LIMITED` | ❌ | ✅ |
| `ValidationError` | `VIBE_VALIDATION_FAILED` | ❌ | ❌ |
| `ToolError` | `VIBE_TOOL_EXECUTION_FAILED` | ❌ | ✅ |
| `TimeoutError` | `VIBE_TIMEOUT` | ❌ | ✅ |
| `CancelledError` | `VIBE_CANCELLED` | ❌ | ❌ |
| `LifecycleError` | `VIBE_LIFECYCLE_INVALID_TRANSITION` | ✅ | ❌ |
| `NotImplementedError` | `VIBE_NOT_IMPLEMENTED` | ✅ | ❌ |
| `DiResolutionError` | `VIBE_DI_RESOLUTION_FAILED` | ✅ | ❌ |
| `DiCircularDependencyError` | `VIBE_DI_CIRCULAR_DEPENDENCY` | ✅ | ❌ |
| `PluginConflictError` | `VIBE_PLUGIN_CONFLICT` | ✅ | ❌ |
| `PluginNotFoundError` | `VIBE_PLUGIN_NOT_FOUND` | ❌ | ❌ |

`TimeoutError` carries an extra serializable field, `timeoutMs`, and overrides
`toJSON()` to include it — so "how long before it timed out" survives serialization
too. Note the deliberate split: `CancelledError` is **not** retryable (a cancel is a
decision, not a transient fault), while `TimeoutError` and the rate-limit/provider
errors **are** — precisely the flags the runtime keys off.

## Factories

Prefer the lower-cased factory functions over `new` — they're the idiomatic
constructors and keep call sites terse:

```ts
configError(message, cause?)              runtimeError(message, cause?)
providerAuthError(message, cause?)        providerRateLimitError(message, cause?)
validationError(message, cause?)          toolError(message, cause?)
timeoutError(message, timeoutMs, cause?)  cancelledError(message, cause?)
lifecycleError(message, cause?)           notImplementedError(message)
diResolutionFailed(message, cause?)       diCircularDependency(message, cause?)
pluginConflictError(message, cause?)      pluginNotFoundError(message, cause?)
```

These are used throughout the foundations: `createContainer` throws
`diResolutionFailed`/`diCircularDependency` ([DI](./03-dependency-injection.md)),
`createLifecycle` throws `lifecycleError` ([Lifecycle](./04-lifecycle.md)),
`createPluginHost` throws `pluginConflictError`/`pluginNotFoundError`
([Plugins](./06-plugin-system.md)), the runtime throws `timeoutError`/
`cancelledError`/`runtimeError` ([Runtime](./05-runtime-execution.md)), and
`system.ask()` throws `notImplementedError` on purpose today.

## How retry and telemetry branch on codes

The whole point of coded errors is behavior that reads the code/flags, not the
message:

- **Retry.** The [runtime](./05-runtime-execution.md#what-counts-as-retryable)
  retries iff `retryable !== false`. `RuntimeError`, `TimeoutError`,
  `ProviderError`, `ProviderRateLimitError`, `ToolError` back off; `CancelledError`,
  `ValidationError`, `ProviderAuthError`, and every fatal error fail fast.
- **Telemetry.** [Structured logs](./08-logging-observability.md) record `code` as a
  metadata field, so dashboards aggregate `VIBE_PROVIDER_RATE_LIMITED` vs
  `VIBE_TOOL_EXECUTION_FAILED` without regexing messages.
- **Control flow.** `fatal` decides whether to unwind the system or recover
  locally; the [agent loop](./09-agent-loop.md) returns tool failures to the model
  (`is_error` tool result) rather than throwing, because a `ToolError` is
  non-fatal and the model can re-plan.

## 🚧 Planned: model & agent error additions

The agentic layer extends the taxonomy with codes the [agent loop](./09-agent-loop.md#error-taxonomy-in-the-loop)
and [model layer](./10-model-provider-layer.md) reference. Each is a `VibeError`
subclass with its own code and correct flags:

| Planned error | Meaning | `retryable` |
|---|---|---|
| `RateLimitError` 🚧 | Provider HTTP 429 | ✅ (backoff) |
| `OverloadedError` 🚧 | Provider HTTP 529 | ✅ (backoff) |
| `InvalidRequestError` 🚧 | Provider HTTP 400 (bad request) | ❌ |
| `ModelRefusalError` 🚧 | `stop_reason: "refusal"`; carries the refusal category | via fallback (policy) |
| `AgentIterationLimitError` 🚧 | Loop hit `maxIterations` | ❌ |

These map cleanly onto the existing pattern — `RateLimitError`/`OverloadedError`
are essentially specialized, HTTP-status-carrying siblings of today's
`ProviderRateLimitError`/`ProviderError`, so the runtime already knows to retry
them and skip the non-retryable ones.

See [Core concepts → VibeError](./01-core-concepts.md#vibeerror-exists) for the
one-paragraph version.
