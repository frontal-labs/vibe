---
title: "Package Topology"
description: "Vibe is a strictly layered `bun`/Turborepo monorepo under the `@vibe/*` scope."
---

# Package Topology

Vibe is a strictly layered `bun`/Turborepo monorepo under the `@vibe/*` scope.
Every package declares its intra-repo dependencies in its own `package.json` as
`workspace:*`, and those declarations *are* the architecture: the dependency graph
is acyclic and flows in one direction — **down**. This page is the map, and the
layering rules that keep it honest.

## The graph

```
   ┌───────── LANGUAGE TOOLCHAIN (🚧 · Rust crates/ workspace) ─────┐
   │  vibe (CLI)   vibe_compiler   vibe_lsp   (Rust binaries/addons) │
   │      emits .ts that imports the runtime below ────────────┐    │
   └───────────────────────────────────────────────────────────┼────┘
                                                                │ generated code
                         ┌──────────────┐                       │
                         │  @vibe/core  │◀──────────────────────┘
                         └──────┬───────┘   composition root — the compile target
                                │           + orchestration (not agentic yet)
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                      │
   ┌──────▼──────┐       ┌──────▼──────┐       (🚧 agentic layer slots here:
   │ @vibe/plugin│       │ @vibe/runtime│         @vibe/model → tools → memory → agent)
   └──────┬──────┘       └──────┬──────┘
          │                     │
          │   both depend on ───┼──────────────┐
          │                     │              │
   ┌──────▼──────┐   ┌──────────▼──────┐  ┌────▼─────┐
   │@vibe/lifecycle│  │  @vibe/di       │  │@vibe/logger│
   └──────┬──────┘   └──────┬──────────┘  └────┬─────┘
          │                 │                  │
          └────────┬────────┴──────────────────┘
                   │  all depend on ──▶
             ┌─────▼──────┐
             │@vibe/errors │  depends on ──▶ @vibe/shared
             └─────┬──────┘
                   │
             ┌─────▼──────┐
             │@vibe/shared │  zero dependencies — the floor
             └────────────┘
```

The exact declared edges (from each `package.json`):

| Package | `@vibe/*` dependencies |
|---|---|
| `@vibe/shared` | *(none)* |
| `@vibe/errors` | `shared` |
| `@vibe/di` | `errors`, `shared` |
| `@vibe/lifecycle` | `errors`, `shared` |
| `@vibe/logger` | `errors`, `shared` |
| `@vibe/plugin` | `errors`, `lifecycle`, `shared` |
| `@vibe/runtime` | `errors`, `lifecycle`, `shared` |
| `@vibe/core` | `di`, `errors`, `lifecycle`, `logger`, `plugin`, `runtime`, `shared` |
| 🚧 `@vibe/config` | `errors`, `shared` (+ types from `model`/`tools`/`plugin` for `VibeConfig`) |
| 🚧 `@vibe/compiler` (npm) | thin JS launcher over the `vibe_napi` `.node` addon (Rust `vibe_compiler`); no `@vibe/*` runtime deps |
| 🚧 `@vibe/language-server` (npm) | thin launcher over the `vibe_lsp` Rust binary |
| 🚧 `vibe` (CLI, npm) | thin launcher; prebuilt `vibe_cli` binary via `@vibe/cli-<platform>` `optionalDependencies` |

The toolchain is **dev-time**: it runs at compile time and is not shipped in the
running agent. Note the toolchain rows above are *not* Rust-to-`@vibe/*` edges —
those npm packages are launchers around Rust crates (see [The two workspaces](#the-two-workspaces-rust--bun)
below); the Rust `crates/` graph is documented in
[Rust implementation](../language/05-rust-implementation.md). The **emitted**
TypeScript is what imports the runtime (`core`, `agent`, `model`, `tools`,
`memory`, `plugin`) — those are the compile target's dependencies, resolved in the
generated `.vibe.ts`, not in your `.vibe` source.

### The two workspaces (Rust + bun)

The repo carries **two** coexisting workspaces that meet at the emitted `.ts`:

- **`crates/` — a Cargo workspace (Rust).** The whole language toolchain —
  `vibe_span`, `vibe_diagnostics`, `vibe_lexer`, `vibe_ast`, `vibe_parser`,
  `vibe_binder`, `vibe_checker`, `vibe_emit`, `vibe_fmt`, `vibe_compiler`,
  `vibe_cli`, `vibe_lsp`, `vibe_napi`, `vibe_wasm` — following the SWC/Biome/oxc
  playbook. `cargo` builds it into per-platform binaries and `.node`/`.wasm`
  addons. The `vibe` CLI and the language server are **Rust binaries**, not Node
  scripts.
- **`packages/` — a bun/Turborepo workspace (TypeScript).** The `@vibe/*` runtime
  documented on this page, plus thin npm **launchers** that resolve and exec the
  prebuilt Rust binaries: the `vibe`/`@vibe/compiler`/`@vibe/language-server`
  packages ship as JS launchers whose `optionalDependencies` are platform packages
  (`@vibe/cli-darwin-arm64`, `@vibe/cli-linux-x64-gnu`, …) carrying the binary — the
  `@biomejs/biome` distribution model — while in-process compilation uses the
  `vibe_napi` `.node` addon published as `@vibe/compiler-<platform>`.

`cargo` builds the toolchain; `bun`/`turbo` build the runtime and wrap the
binaries. The emitted `.ts` imports the runtime packages, so the acyclic-layering
point is unchanged: **the Rust toolchain generates code that imports the runtime;
nothing in the runtime ever depends up into the toolchain.** Full detail —
crate graph, two-pass type checking, distribution — lives in
[Rust implementation](../language/05-rust-implementation.md).

Two facts worth noting against the tidy diagram: `@vibe/plugin` **and**
`@vibe/runtime` both depend on `@vibe/lifecycle` (plugin hooks and runtime work
are both keyed to lifecycle events), and `@vibe/core` does **not** yet depend on
any agentic package because none exist — `system.ask()` is stubbed. See
[Overview](./00-overview.md) for the picture and [Core concepts](./01-core-concepts.md)
for the nouns.

## The tiers, bottom-up

### Foundations

- **`@vibe/shared`** — the floor. `Brand<Base, BrandName>` (the branded-type
  primitive everything else builds identity on), type guards (`isObject`,
  `isString`, `isError`, `isPromise`, `assertNever`, …), the `ContextStore<T>`
  (`AsyncLocalStorage` wrapper the logger's correlation context rides on), utility
  types (`Result`, `Awaitable`, `Maybe`, `Fn`, `Nullish`), and `VERSION`. Zero
  dependencies **on purpose** — anything depending on `shared` cannot create a
  cycle. It sits at the bottom because it defines vocabulary, not behavior.

- **`@vibe/errors`** — `VibeError` (the base), the `ErrorCode` enum, the typed
  subclasses, and factory functions. It depends only on `shared` (for `isError`).
  Everything above it throws *typed, coded* errors, so errors must be near the
  bottom. See [Errors](./07-errors.md).

- **`@vibe/di`**, **`@vibe/lifecycle`**, **`@vibe/logger`** — the three independent
  foundation services. Each depends on `errors` + `shared` and **not on each
  other**. That independence matters: DI, the lifecycle state machine, and logging
  are orthogonal concerns, and keeping them unaware of one another is what lets
  `core` compose them freely. See [DI](./03-dependency-injection.md),
  [Lifecycle](./04-lifecycle.md), [Logging](./08-logging-observability.md).

### Orchestration

- **`@vibe/plugin`** — the plugin host and hook registry. Depends on `lifecycle`
  because its `onBefore`/`onAfter` hooks are keyed to `LifecycleEvent`. See
  [Plugin system](./06-plugin-system.md).

- **`@vibe/runtime`** — the durable execution engine (scheduler, retry with
  jittered backoff, cancellation, resource limits, checkpoints, streaming). Depends
  on `lifecycle` (executions align to lifecycle) and `errors` (it throws/normalizes
  typed errors). This is the layer the agent loop runs *on*. See
  [Runtime & execution](./05-runtime-execution.md).

### Composition root

- **`@vibe/core`** — `createSystem(config)`. It imports `createContainer`,
  `createToken`, `createLifecycle`, `createLogger`, `createPluginHost`,
  `createRuntime`, and `notImplementedError`, wires them together, and registers
  the system services as tokens (see [DI](./03-dependency-injection.md#how-core-registers-system-services)).
  It is the *only* package allowed to know about all the others.

### 🚧 Agentic layer (planned)

The agentic packages slot **between orchestration and core**, depending downward on
foundations + orchestration, never sideways-up into `core`:

```
@vibe/model   →  ModelProvider interface + Anthropic reference provider
@vibe/tools   →  typed tool defs, registry, MCP bridge
@vibe/memory  →  conversation + long-term memory (built on shared's ContextStore)
@vibe/agent   →  the agent loop; runs on @vibe/runtime
```

Their intended edges: `model → {errors, runtime, di, logger, shared}`;
`tools → {errors, runtime, di, shared}`; `memory → {shared, errors}`;
`agent → {model, tools, memory, runtime, di, logger, errors, plugin}`. `core` then
gains a dependency on `agent` (+ `model`) so `ask()` can resolve a default agent
and delegate to it. The direction never reverses — `runtime` will never import
`agent`. See [The agent loop](./09-agent-loop.md) and
[Model & provider layer](./10-model-provider-layer.md).

### 🚧 The language toolchain (planned · Rust)

Above the runtime sits the toolchain that turns `.vibe` into TypeScript — the part
that makes Vibe a language rather than a library. It is a **Rust Cargo workspace
under `crates/`** (see [The two workspaces](#the-two-workspaces-rust--bun)); the
only `@vibe/*` npm packages here are thin launchers around the Rust binaries. It is
**dev-time**: it runs the compile, it is not in the deployed agent:

- **`@vibe/config`** — the `VibeConfig` schema + loader shared by the compiler and
  a `vibe.config.ts` escape hatch. This one is genuine TypeScript, depending only on
  `errors`/`shared` plus the *types* of the layers a config can reference.
- **`vibe_compiler` (Rust crate)** — lexer, parser, binder, checker, emitter. It
  reads `.vibe`, and **emits TypeScript** that imports the runtime; embedded TS spans
  are checked by delegating to `tsc` over the emitted `.ts` (not an in-process TS
  API). Consumed from JS via the `vibe_napi` `.node` addon (`@vibe/compiler`). See
  [The compiler](../language/02-compiler.md) and
  [Rust implementation](../language/05-rust-implementation.md).
- **`vibe_lsp` (Rust crate)** — a `tower-lsp` language server that reuses the
  compiler's `vibe_binder`/`vibe_checker` crates (diagnostics, completion, hover,
  go-to-def). Shipped as a prebuilt binary; `@vibe/language-server` is its launcher.
- **`vibe_cli` (Rust crate)** — the `vibe` binary (`new`, `dev`, `build`, `check`,
  `fmt`, `info`), distributed as prebuilt per-platform npm packages. See
  [Toolchain](../language/03-toolchain.md).

This does **not** violate the layering rules. The toolchain doesn't sit *inside* the
runtime dependency graph — it **generates code that imports it**. The relationship
is `tsc`↔JavaScript: the compiler depends on knowing the runtime's shape (for
codegen), the *emitted* code depends on the runtime, and nothing in the runtime ever
depends up into the toolchain. See [The Vibe language](../language/00-overview.md),
[Rust implementation](../language/05-rust-implementation.md), and
[Configuration & the compiler entry points](./14-configuration-and-bootstrap.md).

## Layering rules

1. **Depend down only.** A package may import from any tier below it and never from
   a tier above or from a sibling in a way that would form a cycle. `runtime` must
   not import `core`; `agent` must not import `system`.
2. **Acyclic.** The graph above has no cycles, and it must stay that way. Adding an
   edge that closes a loop is a design error, not a refactor.
3. **The declaration is the contract.** Allowed edges live in each package's
   `package.json` `dependencies`. If code imports `@vibe/x`, `x` must be a declared
   dependency — enforced in CI via the workspace build (Turborepo will not resolve
   an undeclared workspace import) and by the boundary that a package can only
   `import` what it declares.
4. **`shared` stays dependency-free.** It is the cycle-breaker. Anything reusable
   enough to be depended on by everyone goes here precisely *because* it imports
   nothing.
5. **`core` is the only omniscient package.** Composition lives in exactly one
   place. Libraries resolve collaborators by DI token, not by importing `core`.

## Why the shape is the design

The invariants in [Overview → Design invariants](./00-overview.md#design-invariants)
are enforced by this topology, not by convention:

- *"The runtime owns execution semantics"* holds because `agent` will sit **above**
  `runtime` and depend on it — the loop cannot reimplement retry/cancel without
  importing the package that already does it.
- *"The model layer is an interface"* holds because `agent` depends on `@vibe/model`
  (the interface), and the Anthropic SDK is a dependency of `model` alone.
- *"Everything fallible returns a typed error"* holds because `errors` is a
  foundation every tier already depends on — there is never an excuse to
  `throw new Error()`.
