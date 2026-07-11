---
title: "Build Plan"
description: "The ordered engineering work to take Vibe from \"tested infrastructure with a"
---

# Build Plan

The ordered engineering work to take Vibe from "tested infrastructure with a
stubbed `ask()`" to a **compiled language for agents** — `.vibe` files that compile
onto a first-class agentic runtime. Phases are sequential where they must be and
parallelizable where noted. Each phase has an exit gate — nothing proceeds until the
gate is green.

There are **two workstreams**:

- **The runtime** (Phases 0–7) — the `@vibe/*` packages that are the **compile
  target**: model, tools, memory, agent, and the front door. Written in TypeScript,
  used by emitted code, never hand-imported in a `.vibe` project.
- **The language toolchain** (Phases R0–R11) — a **Rust** `crates/` Cargo workspace
  (SWC/Biome/oxc style): the `vibe_compiler`, the `vibe_cli` binary, the `vibe_lsp`
  language server, and the editor extension that turn `.vibe` source into TypeScript
  calls onto that runtime. The **authoritative, code-level sequence lives in the
  [Language implementation plan (Rust)](./05-language-implementation-plan.md)** — this
  section only summarizes it and maps the old intent onto its phases. See also
  [The compiler is written in Rust](../language/05-rust-implementation.md) and
  [The Vibe language](../language/00-overview.md).

The relationship is exactly TypeScript→JavaScript: `.vibe` → `.ts` (Vibe compiler, in
Rust) → `.js` (`tsc`/esbuild) → `@vibe/*` runtime. **The language workstream targets the
runtime**, so its emitter (R4) depends on Phases 1–5 being real — though it can develop
against the runtime's *types* and the deterministic fake provider (Phase 1) well before a
live model is wired.

Companion docs: [Roadmap](./00-roadmap.md) (milestones), [Agentic implementation
plan](./02-agentic-implementation-plan.md) (the model→agent detail), [Testing
strategy](./03-testing-strategy.md), [The compiler](../language/02-compiler.md),
[Language syntax](../language/01-syntax.md).

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

## Phase 1 — Model layer (`@vibe/model`)

Deliver the [ModelProvider interface](../architecture/10-model-provider-layer.md)
and the Anthropic reference provider.

- [ ] Package scaffold mirroring existing packages (`src/`, `tests/`, `type-tests/`,
      `tsup`, exports `./dist/index.cjs`).
- [ ] `ModelProvider`, `ModelRequest`, `ModelResponse`, `ContentBlock`,
      `StopReason`, `TokenUsage` types.
- [ ] Anthropic provider: request mapping (adaptive thinking, effort, tools,
      streaming for large `max_tokens`), response normalization, stop-reason
      normalization, `countTokens`.
- [ ] Typed errors mapped from provider HTTP codes → `@vibe/errors`
      (`RateLimitError`, `InvalidRequestError`, `OverloadedError`, `ModelRefusalError`).
- [ ] Deterministic **fake provider** for tests (scripted responses/tool calls).
- [ ] DI token `modelProviderToken`; lifecycle wiring for warm-up/teardown.

**Depends on:** `errors`, `shared`, `di`, `lifecycle`, `logger`, `runtime`.
**Exit gate:** unit + type tests green; fake provider drives a scripted 2-turn
exchange; a live smoke test (guarded by `ANTHROPIC_API_KEY`) returns text.

## Phase 2 — Tools layer (`@vibe/tools`)

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

## Phase 3 — Memory layer (`@vibe/memory`)

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

## Phase 4 — Agent layer (`@vibe/agent`)

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

## Phase 5b — Config resolver (`@vibe/config`)

Deliver the resolved-configuration layer. This is the narrowed remnant of the old
"framework front door" phase: the **barrel `vibe` package + `vibe.boot()`** framing
is retired — that role is now filled by the compiler and the `vibe` CLI (Rust phases
[R4](./05-language-implementation-plan.md#phase-r4--emitter--source-maps)/[R5](./05-language-implementation-plan.md#phase-r5--compiler-library--vibe-buildvibe-check-cli)),
and the front door is the language itself. What survives here is the config schema and
loader, because **both a `config { }` block and a `vibe.config.ts` file compile/resolve
to the same `VibeConfig`**. See
[Configuration & bootstrap](../architecture/14-configuration-and-bootstrap.md).

- [ ] `@vibe/config`: `VibeConfig` schema (Zod-validated), `defineConfig` identity
      helper, `loadConfig` (discover `vibe.config.{ts,mts,cts,js,mjs,cjs}`,
      transpile TS in-memory, import default, validate, normalize), `mergeConfig`
      (defaults → file → env → explicit overrides).
- [ ] A single resolution target: the `config { }` construct (Phase L1 emitter) and a
      `vibe.config.ts` file both produce the same normalized `VibeConfig`; the CLI and
      emitted bootstrap consume it.
- [ ] Loud, typed config failures (unknown model id, missing provider key, unmet
      plugin dependency) surfaced as diagnostics by the CLI/compiler, not raw throws.

**Depends on:** Phase 5 (a working `System` to bootstrap). Consumed by Rust phases
[R4](./05-language-implementation-plan.md#phase-r4--emitter--source-maps)–[R5](./05-language-implementation-plan.md#phase-r5--compiler-library--vibe-buildvibe-check-cli).
**Exit gate:** a `vibe.config.ts` and an equivalent `config { }` block resolve to an
identical `VibeConfig`; a bad model id is rejected with a typed diagnostic.

> **Sequencing note:** 5b can be developed in parallel with Phase 5 against the fake
> provider — the config schema and loader don't need a live model — but it is now
> primarily a dependency of the language toolchain rather than a standalone front door.

---

# Language toolchain (Rust, Phases R0–R11)

> 🚧 The `.vibe` toolchain is a **Rust** `crates/` Cargo workspace (SWC/Biome/oxc
> style) that emits TypeScript onto the `@vibe/*` runtime. The **authoritative,
> code-level sequence is the
> [Language implementation plan (Rust)](./05-language-implementation-plan.md)** —
> phases R0–R11, with exit gates. This section is a **map, not a duplicate**: it exists
> so the two workstreams read together. Do not track the language work here; track it
> in doc 05.

The language is a **parallel workstream** to the runtime. Its emitter (R4) targets the
runtime built in Phases 1–5, so it cannot fully close until those packages exist — but
the lexer/parser/binder/checker (R1–R3) need no runtime at all, and the emitter can
develop against the runtime's *types* and the Phase 1 **fake provider** before a live
model is wired. The two tracks meet at the emitter: the runtime is *what the compiler
emits calls to*, so **every architecture guarantee carries through** — the
[agent loop](../architecture/09-agent-loop.md), the
[durable runtime](../architecture/05-runtime-execution.md),
[typed errors](../architecture/07-errors.md).

**Crates:** `vibe_lexer`, `vibe_parser`, `vibe_binder`, `vibe_checker`, `vibe_emit`,
`vibe_compiler`, `vibe_cli`, `vibe_lsp`, `vibe_fmt`, `vibe_napi`, `vibe_wasm` (plus the
`vibe_span`/`vibe_ast`/`vibe_diagnostics` support crates). See the
[crate dependency graph](../language/05-rust-implementation.md#crate-dependency-graph).

## How the old `L1–L4` intent maps onto `R0–R11`

The retired TypeScript phases `L1–L4` are superseded by the Rust phases. The mapping:

| Old intent (`L1–L4`) | Rust phase(s) | Delivers |
|---|---|---|
| Workspace bootstrap (new) | [R0](./05-language-implementation-plan.md#phase-r0--workspace-bootstrap--done) | Cargo workspace, crate skeletons, Rust CI job, `bechmarks/`→`benchmarks/` rename |
| `L1` compiler MVP — lex/parse/bind/check/emit | [R1](./05-language-implementation-plan.md#phase-r1--foundations-spans-diagnostics-lexer)–[R5](./05-language-implementation-plan.md#phase-r5--compiler-library--vibe-buildvibe-check-cli) | `vibe_lexer`→`vibe_parser`→`vibe_binder`→`vibe_checker`→`vibe_emit`, then `vibe_compiler` + `vibe build`/`vibe check` |
| `L1` embedded-TS type-checking | [R6](./05-language-implementation-plan.md#phase-r6--embedded-typescript-type-check-integration) | Two-pass: Rust checks Vibe semantics (`VBxxxx`), `tsc`/`tsserver` checks embedded TS (`TSxxxx`), re-anchored to `.vibe` |
| `L2` CLI + watch/incremental | [R5](./05-language-implementation-plan.md#phase-r5--compiler-library--vibe-buildvibe-check-cli) + [R7](./05-language-implementation-plan.md#phase-r7--vibe-dev-watch-incremental-run) | `vibe new`/`build`/`check`/`info`, then `vibe dev` (watch + incremental + run) |
| (new) distribution | [R8](./05-language-implementation-plan.md#phase-r8--node--wasm-bindings--npm-distribution) | `vibe_napi` (`.node`), `vibe_wasm`, the `vibe` npm launcher (platform binaries) |
| `L3` LSP + VS Code extension | [R9](./05-language-implementation-plan.md#phase-r9--language-server--editor-extension) | `vibe_lsp` (reuses R3 binder/checker), TextMate grammar, LSP client |
| `L4` `model`/`memory`/`plugin` + interop | [R2](./05-language-implementation-plan.md#phase-r2--parser--ast)–[R6](./05-language-implementation-plan.md#phase-r6--embedded-typescript-type-check-integration) (full construct coverage across the front end) | Remaining constructs, prompt interpolation, `.d.ts`/TS interop |
| `L4` formatter (`vibe fmt`) | [R10](./05-language-implementation-plan.md#phase-r10--formatter--scaffolder-polish) | `vibe_fmt` (idempotent), format-on-save via the LSP, `vibe new` templates |
| (new) release engineering | [R11](./05-language-implementation-plan.md#phase-r11--release-engineering) | Cross-compile matrix, signed binaries, `npm`/`cargo`/Homebrew install, `criterion` perf gate |

**Critical path:** R1–R5 is "a `.vibe` file compiles"; R6/R9 add the TypeScript and
editor experience; R8/R11 make it installable. The emitter (R4) is the coupling point to
the runtime — keep the runtime's public API stable before R4 hardens. For every crate's
responsibility, dependency edges, and exit gate, defer to
[doc 05](./05-language-implementation-plan.md).

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

## Cross-cutting rules for every phase

These apply to the runtime phases (0–7). The language phases (R0–R11) carry their own
Rust ground rules in [doc 05](./05-language-implementation-plan.md#ground-rules)
(acyclic crate graph, `#![forbid(unsafe_code)]`, snapshot-everything, first-class
diagnostics), but rules 7–9 below — the emit contract — bind the emitter identically.

1. **Preserve the acyclic graph** — agentic packages depend down, never up. See
   [Package topology](../architecture/02-package-topology.md).
2. **No bare `throw new Error`** — use `@vibe/errors` factories.
3. **No `console.log`** in library code — use `@vibe/logger`.
4. **Execution semantics come from `@vibe/runtime`** — the loop does not hand-roll
   retry/cancellation.
5. **Ship `tests/` + `type-tests/` with every package**; the CI gate stays green.
6. **Changesets** for every user-facing change (versioning is already configured).
7. **The compiler emits onto the documented runtime** — no shadow API. Emitted code
   calls `defineTool`/`createAgent`/`createSystem`/`createMemory`/`createPluginHost`
   exactly as a hand-written user would; if the emit target doesn't exist yet, the
   language phase waits on the runtime phase that provides it.
8. **One config, two front doors** — a `config { }` block and a `vibe.config.ts` file
   resolve to the **same** `VibeConfig`; neither is privileged.
9. **Default model `claude-opus-4-8`** — the compiler completes/validates model ids
   against the catalog and defaults an agent's `model` to `claude-opus-4-8`.
