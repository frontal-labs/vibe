---
title: "Agent Spec"
description: "An **Agent** binds a model, a system prompt, a tool set, and memory, and exposes a"
---

# Agent Spec

> 🚧 Planned — package `@vibe/agent`. The authoritative contract for the `Agent`
> interface, its inputs/options/results, its event stream, and the loop
> guarantees. This spec is kept **100% consistent with**
> [The agent loop](../architecture/09-agent-loop.md); that page explains the *why*
> and the shape, this one pins the *types* and the guarantees. Companion specs:
> [Model spec](./model-spec.md), [Tool spec](./tool-spec.md).

An **Agent** binds a model, a system prompt, a tool set, and memory, and exposes a
bounded loop over them. `system.ask()` delegates to a **default agent**; advanced
callers construct their own with `system.agent({ … })` or `createAgent({ … })`.

## The `Agent` interface

```ts
interface Agent {
  readonly name: string
  run(input: AgentInput, options?: RunOptions): Promise<AgentResult>
  stream(input: AgentInput, options?: RunOptions): AsyncIterable<AgentEvent>
}
```

- **`run`** drives the loop to completion and resolves with the full result.
- **`stream`** drives the same loop but yields [`AgentEvent`](#agentevent)s as they
  happen (model deltas, tool calls, tool results), ending with a `done` event that
  carries the same `AgentResult` `run` would have returned. `run` is `stream`
  collected; they share one implementation.

Construction (illustrative):

```ts
const agent = createAgent({
  model: "claude-sonnet-4-6",   // id from the model catalog; default claude-opus-4-8
  system: "You are a concise support agent.",
  tools: [getOrderStatus],       // Tool[] from @vibe/tools
  memory,                        // optional; defaults to a fresh in-memory Conversation
})
```

## `AgentInput`

```ts
interface AgentInput {
  readonly text: string
  // Reserved for later (attachments, structured content). `text` is the contract today.
}
```

`ask(prompt)` constructs `{ text: prompt }` and returns `result.text`.

## `RunOptions`

```ts
interface RunOptions {
  maxIterations?: number          // default 10 — hard ceiling on model↔tool round-trips
  cancellationToken?: CancellationToken   // from @vibe/runtime; checked between steps
  toolChoice?: ToolChoice         // auto | required | none | { tool: name }
  signalTimeoutMs?: number        // per model/tool call timeout, enforced by the runtime
}
```

| Option | Default | Meaning |
|---|---|---|
| `maxIterations` | `10` | Hard loop bound. Exceeding it raises `AgentIterationLimitError`. |
| `cancellationToken` | none | Between every step the loop calls `token.throwIfCancelled()`. |
| `toolChoice` | `auto` | Forwarded to the model request (`auto` / `required` / `none` / `{ tool }`). Maps to the provider's `tool_choice` — see [Model spec](./model-spec.md#request-options--anthropic-params). |
| `signalTimeoutMs` | provider/runtime default | Timeout for each individual model or tool execution. |

## `AgentResult`

```ts
interface AgentResult {
  readonly text: string           // final assistant text (accumulated end_turn output)
  readonly messages: Message[]    // full transcript for this run
  readonly usage: TokenUsage      // aggregated across all iterations
  readonly iterations: number     // number of model↔tool round-trips performed
  readonly stopReason: StopReason  // why the loop ended (see model spec)
}
```

`TokenUsage` and `StopReason` are the normalized types owned by the
[model layer](../architecture/10-model-provider-layer.md#the-interface):

```ts
type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "pause"

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}
```

The result is entirely `readonly` — it is a value, not a handle. `usage` is the sum
across iterations; `messages` is the complete transcript (user turn, each assistant
turn, and each tool-results message).

## `AgentEvent`

`stream()` yields this union. It matches the agent-loop doc exactly:

```ts
type AgentEvent =
  | { type: "model:start"; iteration: number }
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "tool:call"; name: string; input: unknown; id: string }
  | { type: "tool:result"; id: string; output: unknown; isError: boolean }
  | { type: "model:end"; iteration: number; usage: TokenUsage }
  | { type: "done"; result: AgentResult }
  | { type: "error"; error: SerializedError }
```

| Event | Emitted when |
|---|---|
| `model:start` | A new iteration's model call begins. |
| `text` | The model streams a text delta. |
| `thinking` | The model streams a thinking delta (empty unless `display: "summarized"` — see [Model spec](./model-spec.md#api-drift-you-must-respect)). |
| `tool:call` | A `tool_use` block is dispatched; `input` is **parsed JSON**, never a raw string. |
| `tool:result` | A tool finished; `isError: true` when the handler threw (returned to the model, see below). |
| `model:end` | An iteration's model call completes; carries that iteration's `usage`. |
| `done` | The loop finished; carries the final `AgentResult`. |
| `error` | An infrastructure failure propagated out of the loop (a typed `VibeError`, serialized). |

Note the distinction between `tool:result{isError:true}` (a *tool* failed; the model
sees it and re-plans) and `error` (the *loop/runtime* failed; the run ends). This is
the same split as the [loop's error taxonomy](../architecture/09-agent-loop.md#error-taxonomy-in-the-loop).

## The default agent (`ask`)

`system.ask(prompt)` resolves — or constructs once and caches — a **default agent**:

- **model**: the system's registered `ModelProvider` bound to `claude-opus-4-8`,
- **system prompt**: a sensible default,
- **tools**: the system's registered tool set,
- **memory**: a fresh `Conversation` per call.

It then returns `agent.run({ text: prompt }).text`. See
[the loop's `ask` relationship](../architecture/09-agent-loop.md#relationship-to-systemask)
and the [wiring step](../plan/02-agentic-implementation-plan.md#package-5--wire-coreask)
in the implementation plan. Until that lands, `ask()` throws `notImplementedError`.

## Loop guarantees

The loop is orchestration; execution goes through
[`@vibe/runtime`](../architecture/05-runtime-execution.md). It guarantees:

### 1. Bounded iterations

`maxIterations` (default **10**) is a hard ceiling on model↔tool round-trips. On
exceeding it the loop raises a typed `AgentIterationLimitError` — **the loop never
spins forever.** This is independent of, and stricter than, any model-side budget.

### 2. Cancellation between steps

If a `cancellationToken` is supplied, the loop calls `token.throwIfCancelled()`
**before every step** (each model call, each tool dispatch). A cancelled run
releases resources and returns/raises promptly with `CancelledError`. This is how
"the user closed the tab" is handled correctly. The runtime's retry never retries
`CancelledError`/`AbortError`.

### 3. Tool failures are returned, not thrown

A tool handler that throws produces a `tool_result` with `isError: true` carrying
the error message — the failure goes **back to the model**, which can recover or
re-plan. Only *infrastructure* failures (the runtime itself failing) propagate out
as typed errors. Read-only tool calls in one turn run **in parallel**, and all
`tool_result` blocks are appended in a **single message** (splitting them degrades
the model's parallel-call behaviour). Concurrency is bounded by the
[`ResourceManager`](../architecture/05-runtime-execution.md). See
[Tool spec](./tool-spec.md).

### 4. Typed errors throughout

Every failure is a `VibeError` with a machine-readable code. The loop's taxonomy,
consistent with the [agent-loop doc](../architecture/09-agent-loop.md#error-taxonomy-in-the-loop):

| Failure | Typed error | Retryable? |
|---|---|---|
| Provider 429 / 529 | `RateLimitError` / `OverloadedError` | Yes (runtime retry, backoff) |
| Provider 400 | `InvalidRequestError` | No |
| Tool handler throws | returned as `tool_result(is_error)` | N/A (model decides) |
| Runtime / tool timeout | `TimeoutError` | Policy |
| Cancelled | `CancelledError` | No |
| Iteration ceiling | `AgentIterationLimitError` | No |
| Model refusal | `ModelRefusalError` | Via fallback (policy) |

### 5. Stop-reason driven

The loop's control flow is driven entirely by the normalized `StopReason`
(`end_turn` returns, `tool_use` iterates, `max_tokens`/`refusal` follow policy,
`pause` re-sends). Normalizing provider stop reasons is the *provider's* job, so the
loop stays provider-agnostic — see
[the stop-reason table](../architecture/09-agent-loop.md#stop-reason-policy).

### 6. Observable by default

Every iteration emits structured logs through the
[logger](../architecture/08-logging-observability.md) under a per-run **trace id**:
`model:start`/`model:end`, token usage, each tool's name + duration + success, and
the final stop reason. A production incident is readable straight from the logs.

## Testing (per [testing strategy](../plan/03-testing-strategy.md))

Agents are tested against a deterministic **fake provider** that replays scripted
exchanges — no network:

- Scripted run `tool_use → tool_result → end_turn` returns the expected text +
  transcript.
- Cancellation mid-run releases and returns/raises `CancelledError`.
- Exceeding `maxIterations` raises `AgentIterationLimitError`.
- Parallel tool calls all resolve into one tool-results message.
- `type-tests/` assert `AgentResult` fields are `readonly` and `AgentEvent`
  narrows correctly by `type`.

## Where to go next

- [The agent loop](../architecture/09-agent-loop.md) — the design and control flow.
- [Tool spec](./tool-spec.md) · [Model spec](./model-spec.md) — the collaborators.
- [Quickstart](../dx/03-quickstart.md#4-swap-a-sub-agents-model) — build one.
