---
title: "Configuration & bootstrap"
description: "The design goal is a **zero-ceremony happy path with a fully-typed config file**:"
---

# Configuration & bootstrap

> 🚧 Planned surface. In Vibe, configuration is plain TypeScript: a
> `defineConfig({…})` in `vibe.config.ts` and/or options passed straight to
> `createSystem(…)`. `@vibe/config` resolves it into a `VibeConfig` that bootstraps
> the runtime. The entry point is the `createSystem(resolved)` call you make
> yourself — there is no separate compiler entry point.

The design goal is a **zero-ceremony happy path with a fully-typed config file**:
you declare your configuration in one place and hand it to `createSystem`, which
does all the wiring. There is no manual container setup, no provider registration,
no glue — the resolved `VibeConfig` *is* the wiring.

## The primary surface: `vibe.config.ts`

Configuration lives in a `vibe.config.ts` at the root of your project, alongside
the TypeScript modules that define your agents, tools, and models:

```ts
// vibe.config.ts
import { defineConfig } from "@vibe/config"

export default defineConfig({
  name: "support-bot",
  logLevel: "info",
  provider: "anthropic",            // reads ANTHROPIC_API_KEY from env
  runtime: {
    limits: { http: 8, db: 4 },     // named ResourceManager concurrency limits
  },
})
```

Your agents, tools, and models are ordinary TypeScript, defined with the `@vibe/*`
APIs and imported where you compose the system:

```ts
// support.ts
import { defineTool, createAgent } from "@vibe/core"
import { z } from "zod"

export const getOrder = defineTool({
  name: "getOrder",
  description: "Look up an order's status.",
  input: z.object({ orderId: z.string() }),
  execute: async ({ orderId }) => { /* … */ },
})

export const support = createAgent({
  model: "claude-opus-4-8",
  system: "You are a concise support agent.",
  tools: [getOrder],
})
```

Tools are wired by passing them to the agent (or `createSystem`) that uses them;
`@vibe/build` traces those `import` edges to code-split tools into lazily-loaded
chunks. See [Core concepts](./01-core-concepts.md).

## Passing config directly to `createSystem`

Some projects prefer to compute config inline, share it with other tooling, or skip
the file entirely — just pass the same shape straight to `createSystem`. It resolves
to the **same** `VibeConfig`:

```ts
// vibe.config.ts
import { createSystem } from "@vibe/core"

const system = createSystem({
  name: "support-bot",
  model: "claude-opus-4-8",
  logLevel: "info",
  runtime: { limits: { http: 8, db: 4 } },
})
```

`defineConfig` (from `@vibe/config`) is an identity helper (like Vite/Vitest's) — it
does nothing at runtime; it exists purely to give `vibe.config.ts` full
type-checking and autocomplete. The file resolves as
`vibe.config.{ts,mts,cts,js,mjs,cjs}` and TypeScript is loaded natively (no build
step). A `vibe.config.ts` and an inline `createSystem({…})` object are two spellings
of one thing; pick whichever fits. (If both exist, the object passed to
`createSystem` is merged on top of the file — explicit overrides win.)

## The `@vibe/config` package — the resolver

A dedicated package so the resolver is testable and reusable, and so
`defineConfig`'s types and the `VibeConfig` schema live in one place. It provides:

- `defineConfig(config: VibeConfig): VibeConfig` — the typed identity helper for
  `vibe.config.ts`.
- `loadConfig(options?): Promise<ResolvedConfig>` — discovers, transpiles,
  validates, and normalizes a `vibe.config.*` file.
- `mergeConfig(base, override)` — deterministic deep-merge, used to layer
  defaults → config → env → overrides.

Both the `vibe.config.ts` file and the object passed to `createSystem` resolve to
the same `VibeConfig` shape and run through the same validate/normalize path — so
there is one code path and one source of truth regardless of which surface you wrote.

## The `VibeConfig` schema

Whether it comes from a `vibe.config.ts` or an inline `createSystem({…})` object,
configuration resolves to this shape:

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

  /** Tools — passed to the agents that use them; imports traced by @vibe/build. */
  tools?: Tool[]

  /** Agents — created with `createAgent(…)`; resolvable by name. */
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

You populate `tools`/`agents`/`plugins` by constructing them with the `@vibe/*`
APIs and passing them in (or attaching them to the agents that use them) — ordinary
TypeScript, checked by `tsc` and traced by `@vibe/build` for code-splitting.

Resolution validates the object (a Zod schema under the hood) and fails **loudly
with a typed error** on a bad config — a missing provider key, an unknown model
id, a plugin dependency that isn't present — so misconfiguration surfaces at
build/boot, not mid-run. Because the config is plain TypeScript, `defineConfig`'s
types already catch a bad model id or a mistyped field in your editor, before you
ever run it.

## Discovery & precedence

Configuration is layered, lowest → highest:

1. **Framework defaults** (`claude-opus-4-8`, adaptive thinking, `logLevel:
   "info"`, default retry policy).
2. **`vibe.config.*`** — the project's declared config.
3. **Environment variables** (`VIBE_*` and known keys like `ANTHROPIC_API_KEY`,
   `LOG_LEVEL`) — see [`.env.example`](../../.env.example).
4. **Explicit overrides** — e.g. a `--log-level` flag on the CLI, or the object
   passed directly to `createSystem`.

Higher layers win. For `vibe.config.*`, `loadConfig` walks up from `cwd` and takes
the first match in the order `vibe.config.ts → .mts → .cts → .js → .mjs → .cjs`.
**Missing config is fine** — defaults apply and `name` falls back to the nearest
`package.json` `name`. Config is progressive, not mandatory.

## Bootstrap flow — `createSystem` is the entry point

There is no separate compiler entry point. You call `createSystem(resolved)`
yourself — directly, or from a thin entry module that `@vibe/build` bundles:

```
vibe.config.ts  (defineConfig default)     createSystem({…})  (inline object)
        │                                          │
        └──────────────┬───────────────────────────┘
                       ▼   resolve to VibeConfig
        @vibe/config.loadConfig()
        discover → transpile → validate → normalize
                       │
                       ▼   merge with env + explicit overrides   (mergeConfig)
                   ResolvedConfig
                       │
                       ▼   @vibe/core.createSystem(resolved)
        build container · lifecycle · logger · plugin host · runtime
        register provider, tool registry, memory as DI tokens
                       │
                       ▼   system.start()   (init → start; plugins; provider warm-up)
                   started System  ──▶  ask() · agent() · stop()
```

The `vibe` CLI wraps this flow:

- **`vibe dev`** — watch + run: resolves config, starts the system with verbose
  logs, and hot-reloads on change.
- **`vibe build`** — bundle to `dist/` for production via `@vibe/build` (optionally
  accelerated by the `vibe_bundler`/`vibe_napi` Rust crates for tool code-splitting).

See [Quickstart](../dx/03-quickstart.md) for the end-to-end flow.

## Calling `createSystem` directly

`createSystem(resolved)` against [`@vibe/core`](../../packages/core/src/system.ts)
**is** the entry point. It is the one, supported way to bootstrap Vibe — whether you
run a standalone Vibe app or embed the runtime inside an existing app:

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

Previously this was framed as a hand-written "escape hatch" underneath a source
language; now it is simply THE way. `createSystem` is the seam and the surface at
once.

## Why this is the right shape

- **Config lives with the code it configures.** A `vibe.config.ts` sits beside the
  `createAgent`/`defineTool` modules it wires — one file, one mental model — and
  it's plain TypeScript, so you can compute values and share it with other tooling.
- **Config is declarative wiring, not a DSL.** Every field resolves to an existing
  DI registration or runtime option. There is exactly one mental model.
- **Typed to the edges.** `defineConfig` (and `createSystem`'s own parameter types)
  give autocomplete and compile-time checking: a bad model id or a mistyped field is
  a `tsc` error in your editor, before you ever run it.
- **Progressive.** No config → sensible defaults. A little config → a real agent.
  Full config → named agents, custom providers, tuned runtime limits.

See the [Quickstart](../dx/03-quickstart.md) for the end-to-end flow,
[Core concepts](./01-core-concepts.md) for the nouns, and
[Roadmap](../plan/00-roadmap.md) for where `@vibe/config` and `@vibe/build` land in
the build order.
