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
   ┌───────── BUILD TOOLING (🚧 · @vibe/build + Rust crates/ accelerator) ┐
   │  @vibe/cli (TS)   @vibe/build   vibe_bundler / vibe_napi (Rust)      │
   │      bundles your TypeScript app that imports the runtime below ─┐   │
   └──────────────────────────────────────────────────────────────────┼──┘
                                                                       │ imports
                         ┌──────────────┐                              │
                         │  @vibe/core  │◀─────────────────────────────┘
                         └──────┬───────┘   composition root — createSystem(...)
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
| 🚧 `@vibe/build` | `errors`, `shared`; loads the `vibe_napi` `.node` accelerator when present |
| 🚧 `@vibe/cli` (TS) | `build`, `config`, `core`, `errors`, `shared` |

The build tooling is **dev-time**: it runs when you bundle the app and is not
shipped in the running agent. A Vibe app is plain TypeScript that imports the
runtime (`core`, `agent`, `model`, `tools`, `memory`, `plugin`) — those are your
app's ordinary dependencies, resolved by your own `import` statements. `@vibe/build`
just bundles that app; it does not generate any wiring.

### The two workspaces (Rust + bun)

The repo carries **two** coexisting workspaces that meet at build time:

- **`crates/` — a Cargo workspace (Rust).** A **build accelerator**, not a language
  compiler. It contains exactly two crates (`Cargo.toml` members = `["crates/*",
  "benchmarks"]`): `vibe_bundler` — an oxc-based static analysis of a Vibe app's
  agent/tool TypeScript modules that extracts `import` declarations and agent→tool
  edges (pure Rust, `#![forbid(unsafe_code)]`) — and `vibe_napi`, a napi-rs binding
  (behind the `node` feature) exposing `tool_edges(source, marker)` and `version()`
  to JS. It compiles nothing and understands no bespoke syntax; it reads TypeScript.
- **`packages/` — a bun/Turborepo workspace (TypeScript).** The `@vibe/*` runtime
  documented on this page, plus `@vibe/build` (the bundler) and `@vibe/cli` (a plain
  TypeScript CLI). `@vibe/build` uses the `vibe_napi` `.node` addon when it is
  available to build a dependency graph and code-split tools into lazily-loaded
  chunks (smaller cold starts); the framework works without it.

`cargo` builds the accelerator; `bun`/`turbo` build the runtime and the CLI. Your
app imports the runtime packages directly, so the acyclic-layering point is
unchanged: **nothing in the runtime ever depends up into the build tooling, and the
build tooling only reads and bundles the app — it never becomes a runtime
dependency.**

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

### 🚧 The build tooling (planned)

Alongside the runtime sits the tooling that bundles a Vibe app for deployment. It
is **dev-time**: it runs when you build, it is not in the deployed agent:

- **`@vibe/config`** — the `VibeConfig` schema + loader for `defineConfig` in
  `vibe.config.ts`. Genuine TypeScript, depending only on `errors`/`shared` plus the
  *types* of the layers a config can reference.
- **`@vibe/build`** — the bundler. It reads your app's agent/tool TypeScript
  modules, builds a dependency graph, and code-splits tools into lazily-loaded
  chunks for smaller cold starts. It optionally offloads the static analysis to the
  `vibe_bundler`/`vibe_napi` Rust accelerator (via `tool_edges(source, marker)`) but
  works in pure TypeScript when the addon is absent.
- **`@vibe/cli`** — the `vibe` command (a plain TypeScript CLI): scaffolding, `dev`,
  `build`, and friends. It drives `@vibe/build` and `@vibe/config`.

This does **not** violate the layering rules. The build tooling doesn't sit
*inside* the runtime dependency graph — it **reads and bundles the app that imports
it**. Your app depends on the runtime; the bundler depends on knowing how to trace
imports; and nothing in the runtime ever depends up into the build tooling. See
[Configuration & bootstrap](./14-configuration-and-bootstrap.md).

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
