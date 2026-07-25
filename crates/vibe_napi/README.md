# vibe_napi

Node.js native addon (napi-rs) exposing the Vibe runtime to JavaScript.

## Exports

### ID Generation

| Function | Returns | Description |
|----------|---------|-------------|
| `getVersion()` | `string` | Addon version |
| `generateExecutionId()` | `string` | New UUID v4 execution identifier |
| `generateTaskId()` | `string` | New UUID v4 task identifier |
| `generateCheckpointId()` | `string` | New UUID v4 checkpoint identifier |

### Cancellation

| Class | Methods |
|-------|---------|
| `JsCancellationTokenSource` | `new()`, `token() -> JsCancellationToken`, `cancel()` |
| `JsCancellationToken` | `isCancelled() -> bool`, `childToken() -> JsCancellationToken` |

### Retry

| Function | Returns | Description |
|----------|---------|-------------|
| `defaultRetryPolicy()` | `JsRetryPolicy` | Default retry policy (3 attempts, exponential backoff) |
| `calculateBackoff(attempt, policy)` | `number` | Backoff delay in ms for a given attempt |

| Class | Getters |
|-------|---------|
| `JsRetryPolicy` | `maxAttempts`, `baseDelayMs`, `maxDelayMs`, `backoffMultiplier` |

### Scheduling

| Class | Methods |
|-------|---------|
| `JsScheduler` | `new()`, `registerTask(id, name, description, maxRetries, timeoutMs)`, `hasTask(id) -> bool`, `unregisterTask(id)` |

### Execution

| Class | Methods |
|-------|---------|
| `JsExecutionEngine` | `new()`, `registerTask(id, name, description, maxRetries, timeoutMs)`, `execute(taskId, inputJson) -> JsExecutionResult`, `cancel(executionId)`, `getExecutionState(executionId) -> string` |

| Class | Getters |
|-------|---------|
| `JsExecutionResult` | `executionId`, `state`, `output`, `error` |

### Utilities

| Function | Description |
|----------|-------------|
| `validateToolInput(schemaJson, inputJson)` | Validates JSON input against a JSON Schema |
| `serializeError(message, code)` | Serializes an error to JSON |
| `countTokens(text, modelFamily)` | Heuristic token count |
| `countMessages(messagesJson, modelFamily)` | Per-message token counts |

## Usage

```ts
import { createRequire } from "node:module"
const addon = createRequire(import.meta.url)("./vibe_napi.node")

const eid = addon.generateExecutionId()
const source = new addon.JsCancellationTokenSource()
const engine = new addon.JsExecutionEngine()
```

## Building

```bash
cargo build --release -p vibe_napi
# then copy the .dylib / .so / .dll to .node
```
