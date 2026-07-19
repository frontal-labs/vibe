# Agentic Implementation Plan

> **Status: ✅ all six packages implemented and green.** `vibe/model`,
> `vibe/tools`, `vibe/memory`, `vibe/agent`, the wired `core.ask()`, and
> one-level multi-agent delegation are built and tested. Workspace gates pass:
> `bun build` (13/13), `bun test` (205 tests), `bun test:types` (25/25),
> `bun typecheck` (23/23). Per-package status notes are inline below; deferred
> items (live-API smoke tests, MCP adapter, deep `vibe/plugin` wiring, token-level
> streaming through retry, nested delegation) are called out where they belong.

The detailed, code-level plan to build the agentic layer: `vibe/model` →
`vibe/tools` → `vibe/memory` → `vibe/agent` → `core.ask()` → multi-agent. This
is the "how" behind [Build plan](./01-build-plan.md) Phases 1–6, grounded in the
existing packages and the current Anthropic API.

Read alongside: [The agent loop](../architecture/09-agent-loop.md),
[Model & provider layer](../architecture/10-model-provider-layer.md),
[Tools & MCP](../architecture/11-tools-and-mcp.md),
[Model spec](../specs/model-spec.md), [Tool spec](../specs/tool-spec.md),
[Agent spec](../specs/agent-spec.md).

## This plan builds the core of the framework

Vibe is a **pure-TypeScript agent framework**: you build an app by importing `vibe/core`
and defining tools and agents against typed APIs. The packages built here
(`vibe/model`, `vibe/tools`, `vibe/memory`, `vibe/agent`) are that core — the surface
a user calls directly (`defineTool`, `createAgent`, `createSystem`).

Keep the API clean and hand-writable: these are the functions users type by hand, so the
ergonomics of the public surface *are* the product. Build order follows the dependency
graph (Build plan [Phases 1–5](./01-build-plan.md#phase-1--model-layer-vibemodel)): the
model layer's types come first, then tools and memory in parallel, then the agent loop
that assembles them, all developed against the deterministic **fake provider** (Package 1)
before a live model is wired.

## Guiding constraints

- **Anthropic SDK, current API.** Default model `claude-opus-4-8`; adaptive
  thinking; `effort` (not `budget_tokens`); no sampling params; streaming for large
  outputs; refusal handling with server-side `fallbacks` opt-in. These are not
  negotiable — the model spec captures the exact rules the provider must honor.
- **Everything through the runtime.** Model and tool calls are runtime executions.
- **Everything typed.** Tool I/O inferred from one Zod schema; branded ids; typed
  errors.

## Package 1 — `vibe/model`

**Status:** implemented and green. `packages/model` ships `types.ts`,
`provider-token.ts`, the `fake/` scripted provider, and the SDK-backed
`anthropic/` provider with **pure, SDK-type-free** `map-request.ts` /
`map-response.ts` (unit-testable offline). 13 tests pass
(`npx vitest run packages/model`), `tsc --noEmit` clean, `tsd` green, and it is
wired into the root `vitest.config.ts` alias map. The live smoke test is deferred
until an `ANTHROPIC_API_KEY` is present. `vibe/errors` already exposed the needed
factories (`providerAuthError`/`providerRateLimitError`/`validationError`/
`runtimeError`), so no new error codes were required; the `fallbacks` beta option
is deferred to when live requests are exercised.

### Files
```
packages/model/src/
  index.ts            exports
  types.ts            ModelProvider, ModelRequest, ModelResponse, ContentBlock, StopReason, TokenUsage
  provider-token.ts   modelProviderToken = createToken<ModelProvider>("model.provider")
  anthropic/
    provider.ts       createAnthropicProvider(opts)
    map-request.ts    ModelRequest → Anthropic MessageCreateParams
    map-response.ts   Anthropic Message → ModelResponse (normalize blocks + stopReason)
    errors.ts         HTTP status → vibe/errors typed errors
  fake/
    provider.ts       createFakeProvider(script) — deterministic, for tests
```

### Key decisions
- **Request mapping** sets `model`, `system`, `messages`, `tools`, `max_tokens`,
  `thinking: { type: "adaptive" }` (default), and `output_config.effort`. It never
  sets `temperature`/`top_p`/`top_k` or `budget_tokens`.
- **Large outputs** (`maxTokens > ~16000`) go through `client.messages.stream(...).finalMessage()`.
- **Normalization** collapses Anthropic content blocks to Vibe's `ContentBlock[]`
  (`text` | `thinking` | `toolUse`) and maps `stop_reason` (`end_turn`, `tool_use`,
  `max_tokens`, `refusal`, `pause_turn`) to Vibe's `StopReason`.
- **Errors:** `429 → RateLimitError`, `529 → OverloadedError`, `400 → InvalidRequestError`,
  `401 → AuthenticationError`, `stop_reason:"refusal" → ModelRefusalError` (category
  attached). All added to `vibe/errors` `error-codes.ts` + factories.
- **Fallbacks:** provider accepts a `fallbacks` option; when set, emits the
  server-side `fallbacks` beta param so a refusal is transparently re-served by
  `claude-opus-4-8`.

### Tests
- Fake provider drives scripted exchanges (text-only, tool-use, refusal).
- `map-request` type test: options → params shape.
- Live smoke test guarded by `ANTHROPIC_API_KEY` (skipped in CI without a key).

## Package 2 — `vibe/tools`

**Status:** implemented and green. `packages/tools` ships `types.ts`,
`define-tool.ts` (Zod schema → typed handler + `z.toJSONSchema` model schema),
`registry.ts` (duplicate-name rejection, `toSchemas()` → `vibe/model`
`ToolSchema[]`), and `execute.ts` (`runToolCall` with input validation, timeout,
and cooperative cancellation). Handler errors, invalid input, and timeouts become
`{ isError: true }` results (surfaced to the model, never thrown); genuine
cancellation rejects to unwind the run. Uses Zod 4's native `z.toJSONSchema`, so
no `zod-to-json-schema` dependency. 9 tests pass
(`npx vitest run packages/tools`), `tsc --noEmit` clean, `tsd` green, wired into
the root `vitest.config.ts` alias map. `mcp/adapter.ts` is deferred until the MCP
workstream.

### Files
```
packages/tools/src/
  index.ts
  types.ts            Tool, ToolContext, ToolResult, ToolSchema, ToolChoice
  define-tool.ts      defineTool({ name, description, schema, execute })
  registry.ts         createToolRegistry()
  execute.ts          runToolCall(tool, input, ctx) — via vibe/runtime
  mcp/adapter.ts      MCP server tools → Tool[]  (flagged)
```

### Key decisions
- `defineTool` takes a **Zod schema**; `z.infer` gives the `execute` handler its
  typed args, and `zod-to-json-schema` (or the SDK's Zod helper) emits the
  model-facing schema. One definition, two consumers.
- `ToolContext` carries `{ cancellationToken, logger, signal }` so handlers can
  cooperate with cancellation and log with the run's trace id.
- `runToolCall` schedules the handler as a runtime execution: timeout,
  cancellation, and an optional `ResourceManager.acquire(limit)`. A thrown handler
  error becomes `{ isError: true, content }` — returned to the model, not thrown.
- Registry rejects duplicate names; exports `toSchemas()` for the request builder.

### Tests
- Define → register → execute round-trip; inferred-arg-type type test; throwing
  tool → `isError`; cancellation aborts a long tool.

## Package 3 — `vibe/memory`

**Status:** implemented and green. `packages/memory` ships `types.ts`
(`Conversation`, `Memory`), `conversation.ts` (append-only with defensive
`snapshot()`), `request-builder.ts` (`buildRequest` assembles a `ModelRequest`,
trimming oldest turns to a token `budget` via a pluggable `TokenCounter` —
default `estimateTokens` at ~4 chars/token, or the provider's `countTokens`), and
`memory-inmemory.ts` (the default map-backed `Memory`, cloned on every read/write
so callers can't alias the store). 7 tests pass
(`npx vitest run packages/memory`), `tsc --noEmit` clean, `tsd` green, wired into
the root `vitest.config.ts` alias map.

### Files
```
packages/memory/src/
  index.ts
  types.ts            Message, Conversation, Memory
  conversation.ts     createConversation()
  request-builder.ts  buildRequest({ system, conversation, tools, budget })
  memory-inmemory.ts  default Memory backend
```

### Key decisions
- `Conversation` wraps `shared`'s context-store; append-only with a snapshot for
  the transcript.
- `buildRequest` assembles the `ModelRequest`, trimming/compacting to a token
  budget (using the provider's `countTokens`), with hooks for context-editing when
  near the limit.

### Tests
- Round-trip a conversation; budget trimming; snapshot immutability.

## Package 4 — `vibe/agent`

**Status:** implemented and green — this is the working agentic loop. `packages/agent`
ships `types.ts` (`Agent`, `AgentInput`, `RunOptions`, `AgentResult`, `AgentEvent`),
`loop.ts` (`runLoop` — an **async generator** shared by `run()` and `stream()`),
`agent.ts` (`createAgent`), `events.ts` (`drain`), and `hooks.ts` (stable `agent:*`
hook-name contract for the future plugin bridge). The loop: appends the user turn,
builds a request via `vibe/memory`, calls the provider through
`executeWithRetry` (transient-error backoff + cancellation), sums usage, then on
`tool_use` runs every call in **parallel** via `runToolCall` and appends all
results as one user message; it ends on `end_turn`/`max_tokens`/`refusal` or raises
past `maxIterations`. Unknown-tool and thrown-handler errors come back as
`isError` tool results so the model can recover. 6 tests pass
(`npx vitest run packages/agent`) covering the scripted `tool_use → tool_result →
end_turn` path, parallel calls into one message, unknown-tool recovery, the
iteration ceiling, mid-run cancellation, and `stream()`; `tsc --noEmit` clean,
`tsd` green, wired into the root `vitest.config.ts` alias map. Deep `vibe/plugin`
wiring and true token-level streaming through the retry path are deferred (the
`hooks.ts` contract and `stream()` event surface are in place for both).

### Files
```
packages/agent/src/
  index.ts
  types.ts            Agent, AgentInput, RunOptions, AgentResult, AgentEvent
  agent.ts            createAgent({ model, system, tools, memory })
  loop.ts             the run loop (see architecture/09)
  events.ts           stream() event plumbing
  hooks.ts            agent:* plugin hooks
```

### The loop (pseudocode)
```ts
async function run(input, options) {
  const trace = newTraceId()
  const ct = options.cancellationToken
  conversation.appendUser(input.text)
  let iteration = 0, usage = emptyUsage()

  while (true) {
    ct?.throwIfCancelled()
    if (++iteration > (options.maxIterations ?? 10))
      throw agentIterationLimitError(iteration)

    const request = buildRequest({ system, conversation, tools: registry.toSchemas() })
    const response = await runtime.execute(modelTaskId, request, {   // retry/backoff/timeout
      retry: retryOn([RateLimit, Overloaded]),
    })
    usage = add(usage, response.usage)
    conversation.appendAssistant(response.content)
    log.info("model:end", { trace, iteration, usage: response.usage })

    if (response.stopReason === "end_turn") return result(response, usage, iteration)
    if (response.stopReason === "refusal")  return handleRefusal(response)  // fallback/policy
    if (response.stopReason === "max_tokens") return handleTruncation(response)

    // tool_use: execute all tool calls in parallel, collect results
    const calls = response.content.filter(isToolUse)
    const results = await Promise.all(calls.map((c) =>
      runToolCall(registry.get(c.name), c.input, { cancellationToken: ct, logger: log, trace })
    ))
    conversation.appendToolResults(results)   // single message, all results
  }
}
```

### Tests
- Scripted fake-provider run: `tool_use → tool_result → end_turn` returns expected
  text + transcript.
- Cancellation mid-run releases and returns/raises.
- Iteration ceiling raises `AgentIterationLimitError`.
- Parallel tool calls all resolve into one results message.

## Package 5 — Wire `core.ask()`

**Status:** implemented and green. `createSystem` now registers
`modelProviderToken`, `toolRegistryToken`, and `memoryToken` in the container
(the provider only when one is configured), exposes `system.agent(overrides?)` for
custom agents, and implements `ask(prompt)` as `agent().run({ text }).text` —
running the real `vibe/agent` loop. `SystemConfig` gained `provider`, `model`,
`system`, `effort`, and `tools`. Without a provider, `ask()`/`agent()` throw a
clear `configError`. Core tests updated: one asserts the no-provider config error,
a new one drives `ask()` with a `createFakeProvider` and gets the scripted text
back. Full workspace suite is 203 tests green; `vibe/core` typechecks and builds.

In `packages/core/src/system.ts`:
- During `createSystem`, register `modelProviderToken`, the tool registry token,
  and the memory token in the container.
- Reuse the existing `lifecycle.onBefore("start", ...)` / `onBefore("stop", ...)`
  hooks to init/teardown the provider and any MCP connections.
- Replace the `ask()` stub:
  ```ts
  async ask(prompt: string): Promise<string> {
    const agent = this.defaultAgent()   // resolves provider + registry + memory
    const result = await agent.run({ text: prompt })
    return result.text
  }
  ```
- Add `system.agent(config)` for custom agents.

Update `SystemConfig` to accept model/provider options and an initial tool set.

## Package 6 — Multi-agent

**Status:** implemented and green. `vibe/agent` ships `createDelegateTool(config)`
— a `Tool` that wraps a sub-agent (its own provider/model/prompt/tools) behind a
`{ task: string }` schema and returns the sub-agent's `AgentResult.text`. Drop it
into a coordinator's tool set for the coordinator/worker pattern; pair with a cheap
model (`claude-haiku-4-5`) for fan-out. The coordinator's cancellation token and
logger flow into each worker run, so cancelling the coordinator cancels its
workers. 2 tests cover the delegate round-trip (worker answer flows back into the
coordinator transcript) and the default tool name/schema. As specified, this is
**one-level** delegation; nested trace ids and deeper nesting are deferred.

- A built-in `delegate` tool (or a coordinator agent) that constructs a sub-agent
  with its own model/prompt/tools and returns its `AgentResult.text`.
- Nested trace ids; cheap-model (`claude-haiku-4-5`) sub-agents for fan-out.
- One-level delegation to start (matches the common coordinator pattern); deeper
  nesting is a later, deliberate step.

## Sequencing & parallelism

```
Phase 0 (base) ──▶ model ──▶ tools ──▶ agent ──▶ core.ask ──▶ multi-agent
                        └──▶ memory ──┘
```
`tools` and `memory` can proceed in parallel once `model`'s types exist. `agent`
needs all three.

## Definition of done for the agentic layer

- ✅ `vibe.system({ name, provider }).start()` then `.ask("...")` returns the
  model's answer (verified with `createFakeProvider`; live API deferred behind
  `ANTHROPIC_API_KEY`).
- ✅ A custom tool defined with `defineTool` is called by the model and its typed
  result flows back (agent loop tests: `tool_use → tool_result → end_turn`).
- ✅ Cancellation, retry, timeouts, and structured logs demonstrably work in a run
  (covered across `vibe/tools` and `vibe/agent` tests).
- ⏳ The [quickstart](../dx/03-quickstart.md) runs verbatim — needs a live key; the
  public API it targets is now in place.
- ✅ Workspace green (`bun build` / `test` / `test:types` / `typecheck`); every new
  package (`model`, `tools`, `memory`, `agent`) has `tests/` + `type-tests/`.

**Deferred (tracked, not blocking):** live-API smoke tests, the MCP tool adapter
(`vibe/tools` `mcp/adapter.ts`), deep `vibe/plugin` hook wiring (the `agent:*`
contract exists), token-level streaming through the retry path (the `stream()`
event surface exists), and nested (>1 level) delegation.
