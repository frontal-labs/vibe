---
title: "Roadmap"
description: "A milestone-oriented view of where Vibe is going. This is the *outcome* map — what"
---

# Roadmap

A milestone-oriented view of where Vibe is going. This is the *outcome* map — what
becomes true at each step — not a task list. For the ordered engineering work and
exit gates, see the [Build plan](./01-build-plan.md); for the code-level model →
agent detail, see the [Agentic implementation plan](./02-agentic-implementation-plan.md);
for the language itself, see [The Vibe language](../language/00-overview.md).

Vibe is a **compiled language for agents**: you write `.vibe`, a **Rust** compiler emits
TypeScript that runs on the `@vibe/*` runtime — the same shape as `.ts` → `.js`. So
the map has **two tracks that converge**: the **runtime** (the compile target, TypeScript,
M0–M4) and the **language** (a Rust `crates/` toolchain — compiler, CLI, LSP, and editor
tooling that emit onto it, ML1–ML4). The language track's authoritative, code-level
sequence is the [Language implementation plan (Rust)](./05-language-implementation-plan.md)
(phases R0–R11); its design rationale is [The compiler is written in
Rust](../language/05-rust-implementation.md). The `ML` milestones below are the *outcome*
view of those phases.

Milestones are cumulative: each one assumes the previous is green. Every milestone
ships with `tests/` + `type-tests/` and keeps `bun ci:check` passing.

## At a glance

The runtime (`M`) track maps to build-plan phases; the language (`ML`) track maps to the
Rust phases R0–R11 in the [Language implementation plan](./05-language-implementation-plan.md).

| Milestone | Theme | Maps to phase(s) | Headline capability unlocked |
|---|---|---|---|
| **M0** | Base is stable | [Phase 0](./01-build-plan.md#phase-0--stabilize-the-base-blocker) | The repo is trustworthy — CI runs, config is committed, docs exist |
| **ML0** | The workspace compiles | [R0](./05-language-implementation-plan.md#phase-r0--workspace-bootstrap--done) | The Cargo workspace builds — every crate present, Rust CI green |
| **M1** | Model layer | [Phase 1](./01-build-plan.md#phase-1--model-layer-vibemodel) | Call a real Anthropic model through a typed provider |
| **M2** | Tools + memory | [Phase 2](./01-build-plan.md#phase-2--tools-layer-vibetools), [Phase 3](./01-build-plan.md#phase-3--memory-layer-vibememory) | Define typed tools; hold a budgeted conversation |
| **M3** | Agent loop — `ask()` works | [Phase 4](./01-build-plan.md#phase-4--agent-layer-vibeagent), [Phase 5](./01-build-plan.md#phase-5--wire-coreask), [5b](./01-build-plan.md#phase-5b--config-resolver-vibeconfig) | **`vibe.system().ask("…")` returns a real answer** |
| **ML1** | The language compiles | [R1](./05-language-implementation-plan.md#phase-r1--foundations-spans-diagnostics-lexer)–[R7](./05-language-implementation-plan.md#phase-r7--vibe-dev-watch-incremental-run) | **A `.vibe` with a `tool` + `agent` lexes→parses→checks→emits→runs** |
| **ML2** | Installable | [R8](./05-language-implementation-plan.md#phase-r8--node--wasm-bindings--npm-distribution) + [R11](./05-language-implementation-plan.md#phase-r11--release-engineering) | Prebuilt binaries via `npm`, `cargo`, and Homebrew |
| **ML3** | The editor lights up | [R9](./05-language-implementation-plan.md#phase-r9--language-server--editor-extension) | LSP + VS Code extension: highlighting, live diagnostics, completion, go-to-def |
| **M4** | Multi-agent | [Phase 6](./01-build-plan.md#phase-6--multi-agent) | A coordinator delegates scoped subtasks to sub-agents |
| **ML4** | Full language surface | [R2](./05-language-implementation-plan.md#phase-r2--parser--ast)–[R6](./05-language-implementation-plan.md#phase-r6--embedded-typescript-type-check-integration), [R10](./05-language-implementation-plan.md#phase-r10--formatter--scaffolder-polish) | `model`/`memory`/`plugin`, prompt interpolation, TS interop, `vibe fmt` |
| **M5** | DX, scaffolder, examples | [Phase 7](./01-build-plan.md#phase-7--hardening--dx-polish) | Bootstrap a working agent app in one command |
| **M6** | 1.0 | (post-Phase 7 + R11) | Depend on Vibe — language and runtime — in production, versioned |

The `M` track is the runtime (TypeScript); the `ML` track is the language (Rust). `ML1`
needs the runtime through `M3` as its emitter target (it can develop against the runtime's
*types* and the fake provider earlier); `ML4` picks up the `model`/`memory`/`plugin` targets
from `M1`/`M2`/`M4`. 1.0 requires **both** tracks green.

---

## M0 — Base is stable

**Goal.** Make the foundation trustworthy before a single agentic package is added.
The infrastructure (`shared`, `errors`, `di`, `lifecycle`, `logger`, `plugin`,
`runtime`, `core`) is already implemented and tested — this milestone is about
finishing the in-flight config refactor and closing the process gaps the
[current-state audit](../analysis/03-current-state-audit.md) flags.

**Headline deliverable.** A committed, coherent centralized-config tree
(`packages/typescript-config`, `packages/biome-config`, root `tsconfig.json` +
Vitest workspace), a green `bun ci:check` on `master`, **and a fixed CI branch
trigger** (`main` → `master`) so CI actually runs. See
[Release & versioning](./04-release-and-versioning.md#the-branch-trigger-bug).

**You can now…** trust that a red build means a real problem — every push is
linted, typechecked, built, and tested on the actual default branch, on a clean
working tree.

## M1 — Model layer

**Goal.** Give Vibe a typed door to a language model: the `ModelProvider`
interface and the Anthropic reference provider (default `claude-opus-4-8`,
adaptive thinking, `effort`, streaming for large outputs, refusal handling).

**Headline deliverable.** `@vibe/model` — the provider interface, the Anthropic
implementation with request/response normalization and HTTP-status → `@vibe/errors`
mapping, and a **deterministic fake provider** for tests. See the
[Model & provider layer](../architecture/10-model-provider-layer.md).

**You can now…** send a normalized `ModelRequest` and get a normalized
`ModelResponse` back — either from Anthropic (guarded by `ANTHROPIC_API_KEY`) or
from the scripted fake provider, with typed errors instead of raw HTTP failures.

## M2 — Tools + memory

**Goal.** Give the model things to *do* and something to *remember*. These two
packages proceed in parallel once `@vibe/model`'s types exist.

**Headline deliverable.** `@vibe/tools` — `defineTool({ schema, execute })` where
one Zod schema both types the handler args and emits the model-facing JSON Schema,
plus a registry and a runtime-backed execution adapter (timeout, cancellation,
errors → `tool_result(is_error)`). And `@vibe/memory` — an append-only
`Conversation` and a `buildRequest` that assembles `system + messages + tools`
within a token budget. See [Tools & MCP](../architecture/11-tools-and-mcp.md) and
[Memory & context](../architecture/12-memory-and-context.md).

**You can now…** define a typed tool, register it, execute it end-to-end through
the runtime, and round-trip a conversation through the request builder — all
without an agent loop yet.

## M3 — Agent loop — the "hello agent" milestone

**Goal.** Assemble M1 + M2 into the run loop and remove the `ask()` stub. This is
the milestone where Vibe stops being infrastructure and starts being a product.

**Headline deliverable.** `@vibe/agent` — the loop (build request → model call via
runtime → stop-reason branch → parallel tool execution → append → iterate) with a
`maxIterations` ceiling, cancellation checks between steps, `stream()` of
`AgentEvent`s, and per-run trace ids — then `core.ask()` wired to construct and run
the default agent. See [The agent loop](../architecture/09-agent-loop.md).

**You can now…**

```ts
import { vibe } from "@vibe/core"

const system = vibe.system({ name: "support-bot" })
await system.start()
const answer = await system.ask("What's the status of order #1024?")
```

…get a **real answer**, with a custom `defineTool` tool called by the model and its
typed result flowing back. The [quickstart](../dx/03-quickstart.md) runs verbatim.

At this point the **runtime is a real compile target** — everything after this on the
`ML` track emits onto it.

## ML0 — The workspace compiles

**Goal.** Turn the empty `crates/` ghost directory into a real Rust toolchain workspace,
so language work has a foundation. This is the `M0` of the language track.

**Headline deliverable.** A Cargo workspace (`[workspace] members = ["crates/*"]`) with
skeletons for every crate (`vibe_lexer`, `vibe_parser`, `vibe_binder`, `vibe_checker`,
`vibe_emit`, `vibe_compiler`, `vibe_cli`, `vibe_lsp`, `vibe_fmt`, `vibe_napi`,
`vibe_wasm`, plus the `vibe_span`/`vibe_ast`/`vibe_diagnostics` support crates), a pinned
`rust-toolchain.toml`, the `bechmarks/`→`benchmarks/` rename, and a **second CI track** —
`cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` — running beside
`bun ci:check`. See [Phase R0](./05-language-implementation-plan.md#phase-r0--workspace-bootstrap--done).

**You can now…** `cargo build` and `cargo test` the whole workspace green in CI — every
crate present, `clippy` clean — so a red Rust build, like a red TS build, means a real
problem.

## ML1 — The language compiles

**Goal.** Turn `.vibe` source into TypeScript that runs. This is the milestone where
Vibe stops being a library you import and becomes a **language you write** — the
TypeScript→JavaScript moment, one level up.

**Headline deliverable.** The Rust front end end-to-end: `vibe_lexer` → `vibe_parser`
→ `vibe_binder` → `vibe_checker` → `vibe_emit`, wrapped by `vibe_compiler` and driven by
the `vibe` CLI (`build`/`check`/`dev`). It type-checks embedded TypeScript via a two-pass
bridge (Rust checks Vibe semantics as `VBxxxx`; `tsc`/`tsserver` checks embedded TS as
`TSxxxx`, re-anchored to `.vibe` via source maps), resolves `use` edges, validates model
ids against the catalog, and emits readable `.ts` (+ `.d.ts` + source map) that calls
`defineTool`/`createAgent` on the runtime. See
[The compiler](../language/02-compiler.md) and Rust phases
[R1](./05-language-implementation-plan.md#phase-r1--foundations-spans-diagnostics-lexer)–[R7](./05-language-implementation-plan.md#phase-r7--vibe-dev-watch-incremental-run)
(`vibe dev` — watch, incremental, run — closes this milestone).

**You can now…** write this

```vibe
// support.vibe
tool GetOrder(orderId: string) -> OrderStatus {
  return (await db.orders.find(orderId)) ?? { status: "not_found" }
}

agent Support {
  model  claude-opus-4-8
  system "You are a concise support agent. Use tools before guessing."
  use    GetOrder
}
```

…and have the compiler emit the `defineTool` + `createAgent` wiring for you — no
imports, no `createSystem` call — then run it and get a real answer. A tool that throws
shows a stack frame at your `.vibe` line, thanks to the source map. Driven from the
terminal: `vibe new` scaffolds an agent, `vibe dev` edits-and-runs it in milliseconds
(watch recompiles only the changed file and its dependents), and `vibe check` fails a bad
model id in CI — the same edit-compile-run loop `tsc --watch` gives TypeScript.

## ML2 — Installable

**Goal.** Ship the Rust toolchain as a prebuilt binary anyone can install, without a Rust
or Node toolchain of their own — the distribution story a compiler needs.

**Headline deliverable.** Node and WASM bindings plus the distribution flow: `vibe_napi`
(a `.node` addon so JS tooling calls the compiler in-process), `vibe_wasm` (compile
`.vibe` in the browser for the playground), and the **`vibe` npm launcher** — platform
binaries shipped as `optionalDependencies`, with a JS shim selecting the right one (the
`@biomejs/biome` model). A cross-compile matrix (macOS arm64/x64, Linux x64/arm64
gnu+musl, Windows x64) in CI produces signed binaries, and install paths cover `npm`,
`cargo`, and Homebrew. See Rust phases
[R8](./05-language-implementation-plan.md#phase-r8--node--wasm-bindings--npm-distribution)
and [R11](./05-language-implementation-plan.md#phase-r11--release-engineering).

**You can now…** run `npx vibe --version` on any platform and get the prebuilt binary,
`import { compile } from "@vibe/compiler"` in Node, `cargo install vibe`, or `brew install
vibe` — no toolchain assembly required.

## ML3 — The editor lights up

**Goal.** Make `.vibe` a first-class file type in the editor — the payoff of a language
over a library.

**Headline deliverable.** `vibe_lsp` (`tower-lsp`) reusing the compiler's binder/checker
crates for **diagnostics, completion, hover, and go-to-definition**, plus a VS Code
extension with a TextMate grammar (syntax highlighting) and an LSP client shipping the
`vibe_lsp` binary (JetBrains/Neovim via generic LSP). Editor and CLI share one compiler,
so they never disagree. See
[Phase R9](./05-language-implementation-plan.md#phase-r9--language-server--editor-extension).

**You can now…** open a `.vibe` file to syntax highlighting and live, agent-aware
diagnostics ("tool `RefundOrder` is never `use`d"); complete a `model` id from the
catalog and a `use` target from your declared tools; hover a model for its info; and
jump from `use Support` to the `agent Support` declaration.

## M4 — Multi-agent

**Goal.** Let an agent hand a scoped subtask to another agent.

**Headline deliverable.** A built-in `delegate` tool / coordinator that spawns a
sub-agent with its own model, prompt, and tools and returns its result, with trace
ids nested under the parent run and cheap-model (`claude-haiku-4-5`) sub-agents for
fan-out. One level of delegation to start. See
[Multi-agent](../architecture/13-multi-agent.md).

**You can now…** build a coordinator that decomposes a task, delegates pieces to
specialized (and cheaper) sub-agents, and integrates the results — with logs that
show the nested traces.

## ML4 — Full language surface

**Goal.** Cover every construct in the [syntax](../language/01-syntax.md), so anything
you can express against the runtime you can express in `.vibe`.

**Headline deliverable.** Full front-end construct coverage for `model`, `memory`, and
`plugin` declarations (emitting onto `@vibe/model`, `@vibe/memory`, and the plugin host),
prompt `${…}` interpolation type-checked against in-scope TypeScript, full **TypeScript
interop** (import into bodies/prompts; `.vibe` importable from `.ts` via emitted `.d.ts`),
and `vibe_fmt` — a complete, idempotent formatter (`gofmt`/`rustfmt` style) wired into the
LSP as format-on-save. See Rust phases
[R2](./05-language-implementation-plan.md#phase-r2--parser--ast)–[R6](./05-language-implementation-plan.md#phase-r6--embedded-typescript-type-check-integration)
and [R10](./05-language-implementation-plan.md#phase-r10--formatter--scaffolder-polish), and
[TypeScript interop](../language/04-typescript-interop.md).

**You can now…** write the whole [worked example](../language/01-syntax.md#worked-example)
— a named `model`, a `memory` backend, a `plugin`, an interpolated `"""…"""` prompt, and a
sub-agent `use` — in one declarative `.vibe` file, import your own `.ts` into it and its
tools back out, and keep it all formatted the same way every time.

## M5 — DX, scaffolder, examples

**Goal.** Make the framework fast to adopt.

**Headline deliverable.** An `examples/` workspace (support bot, research agent), a
`create-vibe` scaffolder, and generated API reference kept in lockstep with the
types.

**You can now…** run one command to get a working, typed agent app — provider
wired, a sample tool defined, tests and type-tests in place — instead of assembling
it by hand.

## M6 — 1.0

**Goal.** Commit to a stable public surface — for **both** the language and the runtime.

**Headline deliverable.** A `1.0.0` release of the runtime `@vibe/*` packages **and** the
Rust toolchain (the `vibe` compiler/CLI, the `vibe_lsp` language server, and the editor
extension), shipped as prebuilt binaries, with a documented stability policy that covers
**the `.vibe` language grammar and the emitted runtime API**, a perf pass complete (with a
`criterion` benchmark gate), and Changesets-driven release automation — versioning the TS
packages and the Rust binaries in lockstep — proven on `master`. See
[Release & versioning](./04-release-and-versioning.md) and [Grammar](../specs/grammar.md).

**You can now…** depend on Vibe in production — write `.vibe`, ship the compiled output —
and rely on semver: breaking changes to the language or the runtime arrive only in major
versions, with changelogs generated from Changesets.
