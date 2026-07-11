---
title: "Runtime & Execution — `@vibe/runtime`"
description: "`@vibe/runtime` is the durable execution engine: register a **Task** (a handler),"
---

# Runtime & Execution — `@vibe/runtime`

`@vibe/runtime` is the durable execution engine: register a **Task** (a handler),
schedule an **Execution** (one run of it), and get back retry with jittered
backoff, cancellation, timeouts, named concurrency limits, progress, checkpoints,
and streaming — all typed. **This is what the agent loop runs on.** Steps 2 (model
call) and 4 (tool calls) of the [agent loop](./09-agent-loop.md) are scheduled as
runtime executions, which is why the loop itself never implements retry or
cancellation. The loop is orchestration; the runtime is execution.

## Task vs Execution

The vocabulary is deliberate:

- A **Task** is a *registered handler* — a definition, identified by a branded
  `TaskId`. You register it once.
- An **Execution** is *one run* of a task with a specific input — identified by a
  branded `ExecutionId`, with its own attempts, cancellation token, and result.

```ts
export type TaskId       = Brand<string, "TaskId">
export type ExecutionId  = Brand<string, "ExecutionId">
export type CheckpointId = Brand<string, "CheckpointId">

export type TaskHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: ExecutionContext,
) => Promise<TOutput>

export interface TaskDefinition<TInput = unknown, TOutput = unknown> {
  id: TaskId
  handler: TaskHandler<TInput, TOutput>
}
```

The branded ids (via `Brand` from [`@vibe/shared`](./02-package-topology.md)) mean
a raw string can't be passed where a `TaskId`/`ExecutionId` is expected. Note the
engine mints ids with a `Date.now()` + module counter scheme
(`` `exec_${Date.now()}_${n}` ``) — process-local, not globally unique.

## The `Runtime` surface

`createRuntime()` returns a `Runtime` composed of an execution engine, a scheduler,
and a resource manager:

```ts
export interface Runtime {
  readonly scheduler: Scheduler
  readonly resources: ResourceManager
  registerTask<I, O>(definition: TaskDefinition<I, O>): void
  execute<I, O>(taskId: TaskId, input: I, options?: ScheduleOptions): Promise<ExecutionResult<O>>
  stream<I, O>(taskId: TaskId, input: I, options?: ScheduleOptions): AsyncIterable<StreamEvent<O>>
  getExecution(executionId: ExecutionId): Promise<ExecutionResult | undefined>
  createCheckpoint(executionId: ExecutionId): Promise<Checkpoint | undefined>
  resumeFromCheckpoint<O>(checkpoint: Checkpoint, taskId: TaskId): Promise<ExecutionResult<O>>
}

export interface ScheduleOptions {
  readonly retry?: Partial<RetryPolicy>
  readonly timeoutMs?: number
}
```

### Results, not thrown errors

`execute` **does not reject on task failure** — it resolves to an `ExecutionResult`
carrying the outcome. This is the "errors are values" stance (see
[Errors](./07-errors.md)) applied to execution:

```ts
export type ExecutionState = "pending" | "running" | "completed" | "failed" | "cancelled"

export interface ExecutionResult<TOutput = unknown> {
  readonly id: ExecutionId
  readonly taskId: TaskId
  readonly state: ExecutionState
  readonly output?: TOutput
  readonly error?: SerializedError
  readonly attempts: number
  readonly startedAt: number
  readonly completedAt?: number
  readonly durationMs?: number
}
```

A handler that throws (after exhausting retries) yields a result with
`state: "failed"` and a `SerializedError`; a cancelled run yields
`state: "cancelled"`. `attempts`, `durationMs`, and timestamps are always
populated, so telemetry reads straight off the result.

## `ExecutionContext` — what the handler gets

Every handler receives a context as its second argument:

```ts
export interface ExecutionContext {
  readonly executionId: ExecutionId
  readonly taskId: TaskId
  readonly attempt: number
  readonly cancellationToken: CancellationToken
  progress(value: unknown): void
  checkpoint(state: unknown): Promise<CheckpointId>
}
```

- **`cancellationToken`** — cooperative cancellation (below). Long handlers should
  call `token.throwIfCancelled()` at safe points.
- **`progress(value)`** — emit intermediate values. Under `execute` these fan out to
  listeners; under `stream` they surface as `progress` events.
- **`checkpoint(state)`** — persist a resumable snapshot, returning a
  `CheckpointId`.

## Retry with jittered backoff

`@vibe/runtime` ships a default policy and the math to apply it:

```ts
export function defaultRetryPolicy(): RetryPolicy {
  return { maxAttempts: 3, initialDelayMs: 200, maxDelayMs: 10_000, backoffMultiplier: 2 }
}

export function calculateDelay(attempt: number, policy: RetryPolicy): number {
  const delay  = policy.initialDelayMs * policy.backoffMultiplier ** (attempt - 1)
  const jitter = Math.random() * delay * 0.1          // up to +10%
  return Math.min(delay + jitter, policy.maxDelayMs)
}
```

Delays grow geometrically (200 ms → 400 ms → 800 ms …), get up to **10% random
jitter** added to avoid thundering-herd retries, and are clamped to `maxDelayMs`.
`ScheduleOptions.retry` is a `Partial<RetryPolicy>` shallow-merged over the
default, so callers override just the fields they care about.

### What counts as retryable

```ts
export function isRetryableError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false
  if (/* error.name === "CancelledError" */) return false
  if (/* "retryable" in error */)            return error.retryable !== false
  return true
}
```

The rules, in order: **never** retry an `AbortError` or a `CancelledError`; if the
error carries a `retryable` flag (as every [`VibeError`](./07-errors.md) does),
honor it; otherwise default to retryable. This is exactly the hook the model layer
relies on — a `RateLimitError`/`OverloadedError` is `retryable: true` and gets
backed off, while an `InvalidRequestError` is `retryable: false` and fails fast
(see [Model & provider layer](./10-model-provider-layer.md#lifecycle--runtime-integration)).

`executeWithRetry(fn, { policy, cancellationToken, timeoutMs, onAttempt? })` is the
loop that ties it together: it checks cancellation before each attempt, races the
call against `timeoutMs` (throwing `timeoutError` on overrun — a `TimeoutError`,
code `VIBE_TIMEOUT`), sleeps `calculateDelay(...)` between attempts (interruptible
by cancellation), and re-throws immediately on a non-retryable error.

## Cancellation

Cooperative, `AbortController`-backed:

```ts
export interface CancellationToken {
  readonly cancelled: boolean
  readonly reason: string | undefined
  onCancelled(listener: () => void): () => void
  throwIfCancelled(): void   // throws cancelledError(reason)
}

export interface CancellationTokenSource {
  readonly token: CancellationToken
  cancel(reason?: string): void
}
```

`createCancellationTokenSource()` gives you the source; hold the source to
`cancel(reason?)`, hand the `token` to work. `throwIfCancelled()` throws a
`CancelledError` (code `VIBE_CANCELLED`) — which `isRetryableError` refuses to
retry, so a cancelled execution stops promptly. This is how "the user closed the
tab" propagates cleanly through the agent loop.

## `ResourceManager` — named concurrency limits

```ts
export interface ResourceManager {
  acquire(name: string, limit: number, options?: { timeoutMs?: number }): Promise<ResourceHandle>
  getUsage(name: string): { active: number; max: number; pending: number }
}
```

A semaphore keyed by name. `acquire("http", 10)` grants a `ResourceHandle`
immediately if the pool has room, otherwise queues you (FIFO) until a
`handle.release()` frees a slot — or rejects with `timeoutError` if `timeoutMs`
elapses first. This is what keeps ten parallel tool calls from opening ten thousand
connections: a tool acquires a named limit before it does I/O. `getUsage(name)`
exposes `{ active, max, pending }` for observability.

## Streaming executions and `StreamEvent`

`stream(taskId, input, options?)` returns an `AsyncIterable<StreamEvent>` instead of
a single result:

```ts
export type StreamEvent<TOutput = unknown> =
  | { type: "start";      executionId: ExecutionId }
  | { type: "progress";   executionId: ExecutionId; value: unknown }
  | { type: "checkpoint"; executionId: ExecutionId; checkpointId: CheckpointId }
  | { type: "complete";   executionId: ExecutionId; result: ExecutionResult<TOutput> }
  | { type: "error";      executionId: ExecutionId; error: SerializedError }
```

The stream always opens with `start`, replays `progress` values, and closes with
either `complete` (carrying the full `ExecutionResult`) or `error`. This is the
transport the [agent loop's](./09-agent-loop.md) `stream()` builds on to surface
per-token deltas and tool events.

## Checkpoints and resume

`ExecutionContext.checkpoint(state)` persists a `Checkpoint`:

```ts
export interface Checkpoint {
  readonly id: CheckpointId
  readonly executionId: ExecutionId
  readonly state: unknown
  readonly attempt: number
  readonly timestamp: number
}
```

`runtime.createCheckpoint(executionId)` fetches the latest checkpoint for an
execution, and `runtime.resumeFromCheckpoint(checkpoint, taskId)` re-runs the task
with the saved `state` as input — the seam for durable, resumable long-horizon
agent runs. (The current engine holds checkpoints in memory; a persistent store is
the natural extension point.)

## The `Scheduler`

`runtime.scheduler` wraps the engine with lookup-and-run semantics:

```ts
export interface Scheduler {
  schedule<I, O>(taskId: TaskId, input: I, options?: ScheduleOptions): Promise<ExecutionResult<O>>
  cancel(executionId: ExecutionId): Promise<void>
  getStatus(executionId: ExecutionId): Promise<ExecutionResult | undefined>
}
```

`schedule` validates the task exists (throwing `runtimeError` — `VIBE_RUNTIME_PANIC`
— if not) before executing; `cancel` cancels only `pending`/`running` executions
(a no-op otherwise); `getStatus` returns the last known `ExecutionResult`.

---

Put together: the agent loop registers "call the model" and "run this tool" as
tasks, schedules them per iteration with a retry policy and a cancellation token,
bounds tool concurrency via the resource manager, and reads usage/latency off the
`ExecutionResult` for the [logs](./08-logging-observability.md). The runtime gives
the loop production semantics for free — see [The agent loop](./09-agent-loop.md).
