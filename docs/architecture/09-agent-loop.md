# The Agent Loop

> Package `vibe/agent`. This is the heart of the agentic layer, and the thing
> `system.ask()` delegates to. The section [Current behavior](#current-behavior) records
> what the implementation guarantees.

An agent is a loop. The model decides, calls tools, observes results, and decides
again, until it emits a final answer or hits a bound. Vibe's contribution is
running that loop **on top of the existing runtime** so it inherits cancellation,
retry, timeouts, concurrency limits, structured errors, and observability instead
of reinventing them.

## The shape

```
Agent.run(input)
  │
  ├─ 1. Build request      messages (from memory) + tool schemas + options
  │
  ├─ 2. Model call         provider.generate(request)   ← scheduled as a runtime execution
  │        │                                              (retry on 429/529, cancel, timeout)
  │        ▼
  ├─ 3. Inspect stopReason
  │        ├─ "end_turn"  ─────────────▶ append, RETURN final text
  │        ├─ "tool_use"  ─────────────▶ go to 4
  │        ├─ "max_tokens"─────────────▶ continue or surface (policy)
  │        └─ "refusal"   ─────────────▶ surface typed error / fallback (policy)
  │
  ├─ 4. Execute tool calls (in parallel where safe)
  │        each tool call → runtime execution → ToolRegistry.get(name).execute(args, ctx)
  │        collect all tool_result blocks (including is_error for failures)
  │
  ├─ 5. Append assistant turn + tool results to memory
  │
  └─ 6. Guard: iteration++ ; if iteration > maxIterations → stop (typed error)
           else go to 2
```

Steps 2 and 4 are the only places the loop leaves the process, and both go through
[`vibe/runtime`](./05-runtime-execution.md). That is the whole design insight:
**the loop is orchestration; the runtime is execution.**

## Proposed types

```ts
interface Agent {
  readonly name: string
  run(input: AgentInput, options?: RunOptions): Promise<AgentResult>
  stream(input: AgentInput, options?: RunOptions): AsyncIterable<AgentEvent>
}

interface RunOptions {
  maxIterations?: number          // default 10 — hard loop bound
  cancellationToken?: CancellationToken
  toolChoice?: ToolChoice         // auto | required | none | { tool: name }
  signalTimeoutMs?: number
}

interface AgentResult {
  readonly text: string
  readonly messages: Message[]    // full transcript for this run
  readonly usage: TokenUsage      // aggregated across iterations
  readonly iterations: number
  readonly stopReason: StopReason
}

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

## Iteration control

The loop is bounded three ways, in order of preference:

1. **`maxIterations`** — a hard ceiling on model↔tool round-trips (default 10).
   Hitting it raises a typed `AgentIterationLimitError`; the loop never spins
   forever.
2. **Cancellation** — a `CancellationToken` from `vibe/runtime`. Between every
   step the loop calls `token.throwIfCancelled()`. A cancelled run releases
   resources and returns/raises promptly. This is how "the user closed the tab" is
   handled correctly.
3. **Model-side budget** — for long agentic runs, the provider can pass a task
   budget so the model self-moderates and wraps up gracefully (see
   [Model spec](../specs/model-spec.md)). This complements, not replaces, the hard
   `maxIterations` bound.

## Tool execution

- Each `tool_use` block becomes a runtime execution. Read-only, side-effect-free
  tools run **in parallel** (the model may emit several tool calls in one turn);
  the loop awaits all of them and returns **all** `tool_result` blocks in a single
  message (splitting them across messages degrades the model's parallel-call
  behavior).
- A tool that throws produces a `tool_result` with `isError: true` and the error
  message — **the failure is returned to the model, not thrown out of the loop** —
  so the agent can recover or re-plan. Infrastructure failures (the runtime itself
  failing) do propagate as typed errors.
- Concurrency is bounded by the [ResourceManager](./05-runtime-execution.md): a
  tool can `acquire` a named limit (e.g. `"http"`, `"db"`) so ten parallel tool
  calls don't open ten thousand connections.

See [Tool spec](../specs/tool-spec.md) for the tool contract.

## Stop-reason policy

The loop's behavior is driven entirely by the model's `stopReason`:

| stopReason | Loop action |
|---|---|
| `end_turn` | Done. Return the accumulated text. |
| `tool_use` | Execute tools, append results, iterate. |
| `max_tokens` | Policy: continue (ask the model to keep going) or surface a truncation error. Default: surface with the partial text. |
| `refusal` | Surface a typed `ModelRefusalError` carrying the refusal category; optionally trigger a provider fallback (see [Model spec](../specs/model-spec.md)). |

Normalizing provider-specific stop reasons into this enum is the provider's job
(see [Model & provider layer](./10-model-provider-layer.md)), so the loop stays
provider-agnostic.

## Observability

Every iteration emits structured logs through the [logger](./08-logging-observability.md)
with a per-run **trace id**: model start/end, token usage, each tool call's name +
duration + success, and the final stop reason. A production incident is readable
straight from the logs.

## Error taxonomy in the loop

| Failure | Typed error | Retryable? |
|---|---|---|
| Provider 429 / 529 | `RateLimitError` / `OverloadedError` | Yes (runtime retry, backoff) |
| Provider 400 (bad request) | `InvalidRequestError` | No |
| Tool handler throws | returned to model as `tool_result(is_error)` | N/A (model decides) |
| Runtime/tool timeout | `TimeoutError` | Policy |
| Cancelled | `CancelledError` | No |
| Iteration ceiling | `AgentIterationLimitError` | No |
| Model refusal | `ModelRefusalError` | Via fallback (policy) |

All extend `VibeError` with codes (see [Errors](./07-errors.md)).

## Why not just call the provider's tool-runner?

Provider SDKs ship a tool-runner helper that drives the loop for you. Vibe runs its
own loop because the loop is exactly where the framework adds value: runtime-backed
cancellation/retry/limits, typed errors, structured logging, plugin hooks, memory
integration, and multi-agent delegation. The provider's tool-runner is a fine
convenience for a script; it is not a production runtime. Vibe's loop *is* the
runtime.

## Relationship to `system.ask()`

`ask(prompt)` constructs (or resolves) a **default agent** — the system's model
provider, a default system prompt, the registered tool set, and a fresh
conversation — and returns `agent.run({ text: prompt }).text`. Advanced callers
build their own `Agent` with a custom model, tools, and memory. See the
[Agentic implementation plan](../plan/02-agentic-implementation-plan.md) for the
build order.


## Current behavior

The loop in `packages/agent/src/loop.ts` provides these guarantees. Each one has tests in
`packages/agent/tests/`.

- **Streaming.** Each model call uses `provider.stream()`. Text and thinking deltas reach the
  caller as they arrive, and the final response is assembled from the provider's `done` event.
- **Retry without duplication.** A transient failure is retried only if no delta has reached the
  caller yet. After that point a retry would repeat text, so the error is raised instead.
- **Governance.** When an agent has a `governance` engine, every tool call is evaluated before it
  runs. `deny` returns an error result to the model; `require-approval` runs the call only if
  `onApproval` resolves `true`, and is denied when no callback is given. `system.agent()` uses the
  system's policy engine by default; `governance.enforce: false` opts out.
- **Tool output framing.** Tool output reaches the model wrapped in
  `<tool_output tool="…" trust="untrusted">…</tool_output>`, with embedded closing tags escaped.
  Runtime notices (unknown tool, governance refusal) are not framed. Framing mitigates prompt
  injection through tool results; it does not replace policy checks.
- **Checkpoints.** With `checkpoint: { runId, store }`, the transcript is saved after each
  completed iteration, and a later run with the same `runId` resumes from it. The checkpoint is
  cleared on completion. Tool calls in the interrupted iteration may run again on resume, so tools
  with side effects should be idempotent.
- **Compaction.** `drop-oldest` and `middle-out` trim whole turns. Cuts never fall between a tool
  call and its result (`isCutPoint`). `summarize` replaces older turns with a model-written summary
  and keeps recent turns verbatim.
- **Budgets.** `maxIterations`, `maxCostCents`, and `toolTimeoutMs` bound a run. Token estimates
  count tool results and tool inputs by their text, so large tool output is compacted rather than
  overflowing the provider.
