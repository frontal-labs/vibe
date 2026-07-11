---
title: "Configuration & the compiler entry points"
description: "The design goal is a **zero-ceremony happy path with a fully-typed escape hatch**:"
---

# Configuration & the compiler entry points

> 🚧 Planned surface. In the Vibe **language**, configuration is a first-class
> construct: a `config { }` block in a `.vibe` file (with a `vibe.config.ts` as an
> equivalent escape hatch). The `vibe` compiler resolves it into a `VibeConfig`
> that bootstraps the runtime. The entry points are the compiler CLI —
> `vibe dev` / `vibe build` — not a hand-written `vibe.boot()`.

The design goal is a **zero-ceremony happy path with a fully-typed escape hatch**:
you declare your configuration alongside your agents and tools, and the compiler
emits the bootstrap. There is no manual container setup, no provider registration,
no glue — the `config` block *is* the wiring.

## The primary surface: a `config { }` block

Configuration lives in your `.vibe` source, next to the `agent`/`tool`/`model`
declarations it configures:

```vibe
// support.vibe
config {
  name      "support-bot"
  logLevel  info
  provider  anthropic              // reads ANTHROPIC_API_KEY from env
  runtime {
    limits { http: 8 ; db: 4 }     // named ResourceManager concurrency limits
  }
}

model Fast { id claude-haiku-4-5 ; effort low }

tool GetOrder(orderId: string) -> OrderStatus { /* … */ }

agent Support {
  model  claude-opus-4-8
  system "You are a concise support agent."
  use    GetOrder
}
```

There is **at most one `config` per compilation** (the checker enforces it —
`VB` diagnostic on a second block). `tools` and `agents` are not listed in
`config`; they're wired declaratively via `use` on each agent, and the compiler
collects them. See [Syntax → `config`](../language/01-syntax.md#config) and
[Grammar](../specs/grammar.md#config).

## The escape hatch: `vibe.config.ts`

Some projects prefer their config in TypeScript — to compute values, share it with
other tooling, or keep it out of `.vibe`. A `vibe.config.ts` is fully supported and
resolves to the **same** `VibeConfig`:

```ts
// vibe.config.ts
import { defineConfig } from "@vibe/config"

export default defineConfig({
  name: "support-bot",
  model: "claude-opus-4-8",
  logLevel: "info",
  runtime: { limits: { http: 8, db: 4 } },
})
```

`defineConfig` is an identity helper (like Vite/Vitest's) — it does nothing at
runtime; it exists purely to give the file full type-checking and autocomplete.
The file resolves as `vibe.config.{ts,mts,cts,js,mjs,cjs}` and TypeScript is loaded
natively (no build step). A `config { }` block and a `vibe.config.ts` are two
spellings of one thing; pick whichever fits. (If both exist, the `.vibe`
`config` block wins and the loader warns.)

## The `@vibe/config` package — the resolver

A dedicated package so the resolver is testable and reusable, and so
`defineConfig`'s types and the `VibeConfig` schema live in one place. It provides:

- `defineConfig(config: VibeConfig): VibeConfig` — the typed identity helper for
  `vibe.config.ts`.
- `loadConfig(options?): Promise<ResolvedConfig>` — discovers, transpiles,
  validates, and normalizes a `vibe.config.*` file.
- `mergeConfig(base, override)` — deterministic deep-merge, used to layer
  defaults → config → env → overrides.

The compiler lowers a `config { }` block into the same `VibeConfig` shape, then
runs it through the same validate/normalize path — so there is one code path and
one source of truth regardless of which surface you wrote.

## The `VibeConfig` schema

Whether it comes from a `config { }` block or a `vibe.config.ts`, configuration
resolves to this shape:

```ts
interface VibeConfig {
  /** System name — used in logs and as the default agent's identity. */
  name?: string                          // defaults to package.json name

  /** Default model, as a catalog id or a full model config. */
  model?: ModelId | ModelConfig          // default: "claude-opus-4-8"

  /** Provider wiring. Default: Anthropic from ANTHROPIC_API_KEY. */
  provider?: ProviderConfig | ModelProvider

  /** Default agent's system prompt. */
  system?: string

  /** Tools — wired via `use` on agents in .vibe; collected by the compiler. */
  tools?: Tool[]

  /** Agents — declared with `agent … { }` in .vibe; resolvable by name. */
  agents?: Record<string, AgentConfig>

  /** Plugins — declared via `plugin`/`use`; dependency-ordered by the host. */
  plugins?: Plugin[]

  /** Memory backend + context/budget policy. */
  memory?: MemoryConfig

  /** Logging. */
  logLevel?: LogLevel                    // default: "info"

  /** Runtime defaults applied to model & tool executions. */
  runtime?: {
    retry?: Partial<RetryPolicy>         // default: @vibe/runtime defaultRetryPolicy
    limits?: Record<string, number>      // named ResourceManager concurrency limits
    defaultTimeoutMs?: number
  }

  /** Agent-loop defaults. */
  agent?: {
    maxIterations?: number               // default: 10
    effort?: Effort                      // default: "high"
  }
}
```

Each field maps to an existing runtime seam: `provider` → the
[model layer](./10-model-provider-layer.md), `tools` → the
[tool registry](./11-tools-and-mcp.md), `plugins` →
[the plugin host](./06-plugin-system.md), `runtime` →
[`@vibe/runtime`](./05-runtime-execution.md), `agent` →
[the agent loop](./09-agent-loop.md). Config is a thin, declarative front for
wiring that already exists — it does not introduce a second way to do things, it
removes the boilerplate.

In a `.vibe` project, `tools`/`agents`/`plugins` are populated from the `tool`/
`agent`/`plugin` declarations and their `use` edges, not hand-listed — the
compiler's [Bind phase](../language/02-compiler.md#3-bind) knows the wiring.

Resolution validates the object (a Zod schema under the hood) and fails **loudly
with a typed error** on a bad config — a missing provider key, an unknown model
id, a plugin dependency that isn't present — so misconfiguration surfaces at
build/boot, not mid-run. In a `.vibe` project many of these are caught even
earlier, at [Check](../language/02-compiler.md#4-check), as `VB` diagnostics
anchored to your `.vibe` source.

## Discovery & precedence

Configuration is layered, lowest → highest:

1. **Framework defaults** (`claude-opus-4-8`, adaptive thinking, `logLevel:
   "info"`, default retry policy).
2. **`config { }` block or `vibe.config.*`** — the project's declared config.
3. **Environment variables** (`VIBE_*` and known keys like `ANTHROPIC_API_KEY`,
   `LOG_LEVEL`) — see [`.env.example`](../../.env.example).
4. **Explicit overrides** — e.g. a `--log-level` flag on the CLI, or overrides
   passed to `createSystem` when embedding the runtime directly.

Higher layers win. For `vibe.config.*`, `loadConfig` walks up from `cwd` and takes
the first match in the order `vibe.config.ts → .mts → .cts → .js → .mjs → .cjs`.
**Missing config is fine** — defaults apply and `name` falls back to the nearest
`package.json` `name`. Config is progressive, not mandatory.

## Bootstrap flow — the compiler is the entry point

You do not write a `vibe.boot()`. The compiler CLI is the entry point: it resolves
config, emits `createSystem(...)` onto the runtime, and runs it.

```
support.vibe  (config { } block)          vibe.config.ts  (defineConfig default)
        │                                          │
        └──────────────┬───────────────────────────┘
                       ▼   resolve to VibeConfig
        lower config block  /  @vibe/config.loadConfig()
        discover → transpile → validate → normalize
                       │
                       ▼   merge with env + explicit overrides   (mergeConfig)
                   ResolvedConfig
                       │
                       ▼   emitted TypeScript calls @vibe/core.createSystem(resolved)
        build container · lifecycle · logger · plugin host · runtime
        register provider, tool registry, memory as DI tokens
                       │
                       ▼   system.start()   (init → start; plugins; provider warm-up)
                   started System  ──▶  ask() · agent() · stop()
```

- **`vibe dev`** — compile + watch + run: resolves config, emits, starts the
  system with verbose logs, and hot-reloads on change.
- **`vibe build`** — compile to `dist/` for production (no watch).
- **`vibe check`** — resolve + validate config, env, model ids, and tool schemas;
  report problems and exit non-zero. Ideal for CI — the "does my agent even
  configure?" pre-flight, catching a bad provider key or unknown model before
  deploy.

See [Toolchain](../language/03-toolchain.md) for the full CLI.

## Embedding the runtime directly

The bootstrap the compiler emits is an ordinary `createSystem(resolved)` call
against [`@vibe/core`](../../packages/core/src/system.ts). That runtime entry point
still exists as a **first-class, supported way to embed Vibe directly** — for
people who want to run the runtime inside an existing app rather than compile a
`.vibe` project:

```ts
import { createSystem } from "@vibe/core"

const system = createSystem({
  name: "support-bot",
  logLevel: "debug",
  // provider, tools, plugins, runtime limits — the resolved VibeConfig shape
})

await system.start()   // ✅ lifecycle, logger, plugins work today
// system.ask(...) is 🚧 until the agentic layer is wired
await system.stop()
```

This is the compile target, hand-written: the language is the ergonomic front,
`createSystem` is the seam underneath. Use the language for new projects; reach for
`createSystem` when you're embedding the runtime into something that already
exists.

## Why this is the right shape

- **Config lives with the code it configures.** A `config { }` block sits beside
  the `agent`/`tool` declarations it wires — one file, one mental model — with a
  `vibe.config.ts` escape hatch for when you want TypeScript.
- **Config is declarative wiring, not a DSL.** Every field resolves to an existing
  DI registration or runtime option. There is exactly one mental model.
- **Typed to the edges.** In `.vibe`, a bad model id or an unused tool is a `VB`
  diagnostic at Check; in `vibe.config.ts`, `defineConfig` gives autocomplete and
  compile-time checking. Misconfiguration is caught before it can surface at
  runtime.
- **Progressive.** No config → sensible defaults. A little config → a real agent.
  Full config → named agents, custom providers, tuned runtime limits.

See the [Quickstart](../dx/03-quickstart.md) for the end-to-end flow,
[Syntax → `config`](../language/01-syntax.md#config) for the grammar, and
[Build plan → Phase 5b](../plan/01-build-plan.md) for where `@vibe/config` and the
compiler land in the build order.
