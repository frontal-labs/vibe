# Build Plan

The ordered engineering work to take Vibe from "tested infrastructure with a
stubbed `ask()`" to a **complete agent framework** — the `vibe/*` packages that let
you define tools and agents in plain TypeScript and run them. Phases are sequential
where they must be and parallelizable where noted. Each phase has an exit gate —
nothing proceeds until the gate is green.

The whole framework is **TypeScript**: the `vibe/*` packages that provide the model,
tools, memory, agent, and front-door APIs a user imports directly. There is no separate
source language and no compiler — a Vibe app *is* a TypeScript project. The one native
component is an optional **build accelerator** (Phase 7): `vibe/build`, backed by the
`vibe_bundler` Rust crate and its `vibe_napi` binding, which statically analyzes an
app's agent/tool modules to code-split tools into lazily-loaded chunks. It speeds up
cold starts; it does not change how you write an app.

Companion docs: [Roadmap](./00-roadmap.md) (milestones), [Agentic implementation
plan](./02-agentic-implementation-plan.md) (the model→agent detail), [Testing
strategy](./03-testing-strategy.md).

## Phase 0 — Stabilize the base (blocker)

The [current-state audit](../analysis/03-current-state-audit.md) lists an
in-progress, uncommitted config refactor. Finish it before adding packages.

- [ ] Complete the centralized config move: root `tsconfig.json`,
      `vitest.config.ts` + `vitest.workspace.ts`, and the new `packages/biome-config`
      and `packages/typescript-config` packages. Remove the per-package
      `vitest.config.ts` remnants.
- [ ] Fix the CI branch trigger in `.github/workflows/ci.yml` (`main` → `master`).
- [ ] Land this `docs/` tree.
- [ ] Fill empty `package.json` `description` fields.

**Exit gate:** `bun ci:check` (lint → typecheck → build → test) green on `master`;
CI runs on push; working tree clean and committed.

## Phase 1 — Model layer (`vibe/model`)

Deliver the [ModelProvider interface](../architecture/10-model-provider-layer.md)
and the Anthropic reference provider.

- [ ] Package scaffold mirroring existing packages (`src/`, `tests/`, `type-tests/`,
      `vite`, exports `./dist/index.cjs`).
- [ ] `ModelProvider`, `ModelRequest`, `ModelResponse`, `ContentBlock`,
      `StopReason`, `TokenUsage` types.
- [ ] Anthropic provider: request mapping (adaptive thinking, effort, tools,
      streaming for large `max_tokens`), response normalization, stop-reason
      normalization, `countTokens`.
- [ ] Typed errors mapped from provider HTTP codes → `vibe/errors`
      (`RateLimitError`, `InvalidRequestError`, `OverloadedError`, `ModelRefusalError`).
- [ ] Deterministic **fake provider** for tests (scripted responses/tool calls).
- [ ] DI token `modelProviderToken`; lifecycle wiring for warm-up/teardown.

**Depends on:** `errors`, `shared`, `di`, `lifecycle`, `logger`, `runtime`.
**Exit gate:** unit + type tests green; fake provider drives a scripted 2-turn
exchange; a live smoke test (guarded by `ANTHROPIC_API_KEY`) returns text.

## Phase 2 — Tools layer (`vibe/tools`)

Deliver [typed tool definitions and the registry](../architecture/11-tools-and-mcp.md).

- [ ] `Tool`, `ToolRegistry`, `ToolContext`, `ToolResult` types.
- [ ] Zod-based `defineTool({...})` that infers handler arg types **and** emits the
      model-facing JSON Schema.
- [ ] Registry: register/get/list; conflict detection; schema export for the model
      request.
- [ ] Execution adapter: run a tool call as a [runtime execution](../architecture/05-runtime-execution.md)
      with cancellation, timeout, and a named `ResourceManager` limit; map thrown
      errors to `tool_result(is_error)`.
- [ ] MCP adapter (behind a flag): surface MCP server tools as `Tool`s.

**Depends on:** `errors`, `shared`, `runtime`, `logger`; peer `zod`.
**Exit gate:** define → register → execute a tool end-to-end; type test proves
handler args are inferred from the schema; a throwing tool yields `isError`.

## Phase 3 — Memory layer (`vibe/memory`)

Deliver [conversation + memory + context management](../architecture/12-memory-and-context.md).

- [ ] `Conversation` (ordered messages, append, snapshot) built on `shared`'s
      context-store.
- [ ] `Memory` interface (get/set/append) with an in-memory default; pluggable
      backends.
- [ ] Request builder: assemble `system + messages + tools` within a token budget;
      hooks for compaction/context-editing when near the limit.

**Depends on:** `shared`, `model` (types), `logger`.
**Exit gate:** a conversation round-trips through the request builder; budget
trimming has a unit test.

## Phase 4 — Agent layer (`vibe/agent`)

Deliver [the agent loop](../architecture/09-agent-loop.md).

- [ ] `Agent`, `RunOptions`, `AgentResult`, `AgentEvent` types.
- [ ] The loop: build request → model call (via runtime) → stop-reason branch →
      parallel tool execution → append → iterate, with `maxIterations` ceiling and
      cancellation checks between steps.
- [ ] `stream()` yielding `AgentEvent`s.
- [ ] Structured logging with a per-run trace id; token-usage aggregation.
- [ ] Agent-level plugin hooks (`agent:beforeModelCall`, `agent:afterToolCall`, …).

**Depends on:** `model`, `tools`, `memory`, `runtime`, `logger`, `errors`, `plugin`.
**Exit gate:** with the fake provider, a scripted tool-use → tool-result →
end_turn run returns the expected text and transcript; cancellation mid-run
releases and returns; iteration ceiling raises the typed error.

## Phase 5 — Wire `core.ask()`

- [ ] Implement `System.ask(prompt)` to resolve/construct the default agent and
      return `agent.run({ text: prompt }).text`.
- [ ] Register the model provider, tool registry, and memory in the System's
      container during setup; wire provider init/teardown into the existing
      lifecycle hooks.
- [ ] Remove the `notImplementedError` stub.
- [ ] Add `System.agent(config)` for constructing custom agents.

**Depends on:** Phases 1–4.
**Exit gate:** `vibe.system({name}).start()` then `.ask("...")` returns a real
answer; a tool-using example works; the [quickstart](../dx/03-quickstart.md) runs
verbatim.

## Phase 5b — Config resolver (`vibe/config`)

Deliver the resolved-configuration layer: the config schema and loader, so a
`vibe.config.ts` file resolves to a normalized `VibeConfig` that the system consumes.
See [Configuration & bootstrap](../architecture/14-configuration-and-bootstrap.md).

- [ ] `vibe/config`: `VibeConfig` schema (Zod-validated), `defineConfig` identity
      helper, `loadConfig` (discover `vibe.config.{ts,mts,cts,js,mjs,cjs}`,
      transpile TS in-memory, import default, validate, normalize), `mergeConfig`
      (defaults → file → env → explicit overrides).
- [ ] Loud, typed config failures (unknown model id, missing provider key, unmet
      plugin dependency) surfaced as diagnostics, not raw throws.

**Depends on:** Phase 5 (a working `System` to bootstrap).
**Exit gate:** a `vibe.config.ts` resolves to a normalized `VibeConfig`; a bad model
id is rejected with a typed diagnostic.

> **Sequencing note:** 5b can be developed in parallel with Phase 5 against the fake
> provider — the config schema and loader don't need a live model.

## Phase 6 — Multi-agent

Deliver [sub-agent delegation](../architecture/13-multi-agent.md).

- [ ] A `delegate` tool / coordinator that spawns a sub-agent (own model, prompt,
      tools) and returns its result.
- [ ] Per-sub-agent trace ids nested under the parent run.
- [ ] Cheap-model sub-agents (`claude-haiku-4-5`) for fan-out.

**Exit gate:** a coordinator delegates a scoped subtask and integrates the result;
logs show nested traces.

## Phase 7 — Hardening & DX polish

- [ ] Example apps under a `examples/` workspace (support bot, research agent).
- [ ] `create-vibe` scaffolder (Phase-gated by DX readiness).
- [ ] `vibe/build` — the dependency-graph builder that code-splits tools into
      lazily-loaded chunks, backed by the `vibe_bundler` Rust crate (oxc-based static
      analysis of agent/tool TypeScript modules — extracts `import` declarations and
      agent→tool edges) via the optional `vibe_napi` binding. The framework works
      without the native accelerator; it exists to shrink cold starts.
- [ ] Docs kept in lockstep; API reference generated from types.
- [ ] Perf pass using `tools/profiling`.

## Cross-cutting rules for every phase

1. **Preserve the acyclic graph** — agentic packages depend down, never up. See
   [Package topology](../architecture/02-package-topology.md).
2. **No bare `throw new Error`** — use `vibe/errors` factories.
3. **No `console.log`** in library code — use `vibe/logger`.
4. **Execution semantics come from `vibe/runtime`** — the loop does not hand-roll
   retry/cancellation.
5. **Ship `tests/` + `type-tests/` with every package**; the CI gate stays green.
6. **Changesets** for every user-facing change (versioning is already configured).
7. **Keep the API clean and hand-writable** — `defineTool`/`createAgent`/`createSystem`/
   `createMemory`/`createPluginHost` are what a user calls directly; no shadow surface.
8. **Config is loud** — a `vibe.config.ts` resolves to a validated `VibeConfig`;
   unknown model ids, missing keys, and unmet plugin deps fail as typed diagnostics.
9. **Default model `claude-opus-4-8`** — the default an agent's `model` falls back to,
   validated against the catalog.
