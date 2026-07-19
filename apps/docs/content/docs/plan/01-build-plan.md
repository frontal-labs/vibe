---
title: "Build Plan"
description: "The ordered engineering work to take Vibe from \"tested infrastructure with a"
---

# Build Plan

The ordered engineering work to take Vibe from "tested infrastructure with a
stubbed `ask()`" to a **TypeScript-native agent framework** — a set of `vibe/*`
packages you compose into plain-TypeScript agent apps. Phases are sequential where
they must be and parallelizable where noted. Each phase has an exit gate — nothing
proceeds until the gate is green.

The work is a single workstream — **the `vibe/*` runtime** (Phases 0–7): the
model, tools, memory, agent, and front-door packages that an app imports and calls
directly. Everything is written and consumed in TypeScript; an app is authored in
`.ts` and composed from these APIs (`createSystem`, `defineTool`, `createAgent`).

An optional native accelerator lives in `crates/` — `vibe_bundler` (an oxc-based
static analyzer that extracts a Vibe app's agent→tool import edges) and `vibe_napi`
(its napi-rs binding) — which powers tool code-splitting in `vibe/build`. It is a
build-time performance optimization, not part of the runtime, and the framework
works without it. See [Cross-cutting rules](#cross-cutting-rules-for-every-phase).

Companion docs: [Roadmap](./00-roadmap.md) (milestones), [Agentic implementation
plan](./02-agentic-implementation-plan.md) (the model→agent detail), [Testing
strategy](./03-testing-strategy.md), [Quickstart](../dx/03-quickstart.md).

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
      `tsup`, exports `./dist/index.cjs`).
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
**Exit gate:** `createSystem({name}).start()` then `.ask("...")` returns a real
answer; a tool-using example works; the [quickstart](../dx/03-quickstart.md) runs
verbatim.

## Phase 5b — Config resolver (`vibe/config`)

Deliver the resolved-configuration layer: the schema and loader that turn a
`vibe.config.ts` file into a validated, normalized `VibeConfig` the `System`
consumes at boot. See
[Configuration & bootstrap](../architecture/14-configuration-and-bootstrap.md).

- [ ] `vibe/config`: `VibeConfig` schema (Zod-validated), `defineConfig` identity
      helper, `loadConfig` (discover `vibe.config.{ts,mts,cts,js,mjs,cjs}`,
      transpile TS in-memory, import default, validate, normalize), `mergeConfig`
      (defaults → file → env → explicit overrides).
- [ ] Loud, typed config failures (unknown model id, missing provider key, unmet
      plugin dependency) surfaced as diagnostics, not raw throws.

**Depends on:** Phase 5 (a working `System` to bootstrap).
**Exit gate:** a `vibe.config.ts` resolves to a normalized `VibeConfig`; a bad
model id is rejected with a typed diagnostic.

> **Sequencing note:** 5b can be developed in parallel with Phase 5 against the fake
> provider — the config schema and loader don't need a live model.

---

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
- [ ] Docs kept in lockstep; API reference generated from types.
- [ ] Perf pass using `tools/profiling`.
- [ ] Optional native accelerator: harden `vibe_bundler`/`vibe_napi` so `vibe/build`
      can code-split tools into lazily-loaded chunks; keep the pure-TS fallback path
      green when the addon is absent.

## Cross-cutting rules for every phase

These apply to every runtime phase (0–7). The optional native accelerator crates
(`vibe_bundler`, `vibe_napi`) carry their own Rust ground rules —
`#![forbid(unsafe_code)]`, an acyclic crate graph, and `cargo test`/`clippy` in CI —
but they are a build-time optimization for `vibe/build`, not part of the runtime
contract below.

1. **Preserve the acyclic graph** — packages depend down, never up. See
   [Package topology](../architecture/02-package-topology.md).
2. **No bare `throw new Error`** — use `vibe/errors` factories.
3. **No `console.log`** in library code — use `vibe/logger`.
4. **Execution semantics come from `vibe/runtime`** — the loop does not hand-roll
   retry/cancellation.
5. **Ship `tests/` + `type-tests/` with every package**; the CI gate stays green.
6. **Changesets** for every user-facing change (versioning is already configured).
7. **A clean, hand-writable public API** — `defineTool`/`createAgent`/`createSystem`/
   `createMemory`/`createPluginHost` are called directly by app authors, so keep the
   surface small, typed, and composable.
8. **One config source** — a `vibe.config.ts` file resolves to a normalized
   `VibeConfig` consumed by the `System`.
9. **Default model `claude-opus-4-8`** — an agent's `model` defaults to
   `claude-opus-4-8`, validated against the catalog.
