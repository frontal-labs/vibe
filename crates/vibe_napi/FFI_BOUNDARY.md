# FFI Boundary: `vibe_napi` → JavaScript

## Overview
This document describes the FFI boundary between Rust and JavaScript through the `vibe_napi` crate. The boundary uses `napi-rs` v2.16 to generate a native Node.js addon (`.node` file).

## Build
```bash
npm run build          # via turbo pipeline
# or directly:
cargo build -p vibe_napi --release
```

The resulting `.node` addon is loaded by `packages/shared/src/native.ts` via `N-API`.

## Type Mapping Strategy

| Rust Type | NAPI Type | TypeScript Type |
|-----------|-----------|-----------------|
| `String` | `napi::String` | `string` |
| `i64` / `u32` | `napi::Number` | `number` |
| `bool` | `napi::Boolean` | `boolean` |
| `serde_json::Value` | JSON string via `#[napi]` | `string` (JSON) |
| `ExecutionId` (newtype) | `String` | `string` |
| `TaskId` (newtype) | `String` | `string` |
| `CheckpointId` (newtype) | `String` | `string` |
| `CancellationToken` | Class `JsCancellationToken` | `CancellationToken` |
| `CancellationTokenSource` | Class `JsCancellationTokenSource` | `CancellationTokenSource` |
| `RetryPolicy` | Class `JsRetryPolicy` | `RetryPolicy` |
| `Scheduler` | Class `JsScheduler` | `Scheduler` |
| `ExecutionEngine` | Class `JsExecutionEngine` | `ExecutionEngine` |
| `ExecutionResult` | Class `JsExecutionResult` | `ExecutionResult` |

## NAPI Exports

### Cancellation
- `JsCancellationToken` (class): `new()`, `isCancelled()`, `childToken()`
- `JsCancellationTokenSource` (class): `new()`, `token()`, `cancel()`

### Retry
- `JsRetryPolicy` (class): `new(maxAttempts, baseDelayMs, maxDelayMs, backoffMultiplier)`, properties `maxAttempts`, `baseDelayMs`, `maxDelayMs`, `backoffMultiplier`
- `defaultRetryPolicy()` → `JsRetryPolicy`
- `calculateBackoff(attempt, policy)` → `number`

### Scheduler
- `JsScheduler` (class): `new()`, `registerTask(taskId, name, description, maxRetries, timeoutMs)`, `hasTask(taskId)`, `unregisterTask(taskId)`

### Execution Engine
- `JsExecutionEngine` (class): `new()`, `registerTask(taskId, name, description, maxRetries, timeoutMs)`, `execute(taskId, inputJson)` → `JsExecutionResult`, `cancel(executionId)`, `getExecutionState(executionId)` → `string`

### Tools
- `validateToolInput(schemaJson, inputJson)` → `void` (throws on error)

### Errors
- `serializeError(message, code)` → `string` (JSON)

### Token Counting
- `countTokens(text, modelFamily)` → `number`
- `countMessages(messagesJson, modelFamily)` → `number[]`

### ID Generation
- `generateExecutionId()` → `string`
- `generateTaskId()` → `string`
- `generateCheckpointId()` → `string`

## Serialization Strategy
All complex types cross the FFI boundary as JSON strings:
- `serde_json::Value` ↔ JSON string
- `ExecutionResult` ↔ serialized JSON string via getters
- Checkpoint data ↔ JSON string

## Error Handling
- Rust errors are converted to `napi::Error` with descriptive messages
- `VibeError` variants map to error code strings in `serializeError()`
- Tool validation errors propagate as `napi::Error`

## Debugging
- Use `process.env.VIBE_NATIVE_ADDON` to point to a specific `.node` file
- Enable `RUST_LOG=debug` for tracing output from Rust crates
