# Configuration & bootstrap

> 🚧 Planned surface. Configuration is a plain-TypeScript construct: a
> `defineConfig` call in a `vibe.config.ts` file (or the same object passed
> straight to `createSystem`). `vibe/config` resolves it into a `VibeConfig`
> that bootstraps the runtime. The entry points are `@frontal-labs/vibe-cli` — `vibe dev` /
> `vibe build` — over an ordinary `createSystem(...)` call.

The design goal is a **zero-ceremony happy path with a fully-typed escape hatch**:
you declare your configuration alongside your agents and tools in TypeScript, and
the CLI wires up the bootstrap. There is no manual container setup, no provider
registration, no glue — the resolved `VibeConfig` *is* the wiring.

## The primary surface: `defineConfig` in `vibe.config.ts`

Configuration lives in a `vibe.config.ts` alongside the agents and tools it
configures, defined with the `vibe/*` APIs:

```ts
// vibe.config.ts
import { defineConfig, defineAgent, defineTool, defineModel } from "@frontal-labs/vibe"
import { z } from "zod"

const Fast = defineModel({ id: "claude-haiku-4-5", effort: "low" })

const GetOrder = defineTool({
  name: "GetOrder",
  description: "Look up an order's status",
  input: z.object({ orderId: z.string() }),
  execute: async ({ orderId }) => {
    /* … */
  },
})

const Support = defineAgent({
  name: "Support",
  model: "claude-opus-4-8",
  system: "You are a concise support agent.",
  tools: [GetOrder],
})

export default defineConfig({
  name: "support-bot",
  logLevel: "info",
  provider: "anthropic",              // reads ANTHROPIC_API_KEY from env
  agents: { Support },
  runtime: {
    limits: { http: 8, db: 4 },       // named ResourceManager concurrency limits
  },
})
```

`defineConfig` is an identity helper (like Vite/Vitest's) — it does nothing at
runtime; it exists purely to give the file full type-checking and autocomplete.
`defineAgent`/`defineTool`/`defineModel` are the same: they build typed values you
compose into the config. Tools are wired onto each agent via its `tools` array, so
the agents you list carry their own tool set — nothing is hand-listed twice.

## The escape hatch: pass the config straight to `createSystem`

Some projects prefer to skip the config file entirely — to compute values, share
config with other tooling, or embed the runtime in an existing app. The same
`VibeConfig` object can go straight to `createSystem`:

```ts
import { createSystem } from "vibe/core"

const system = createSystem({
  name: "support-bot",
  model: "claude-opus-4-8",
  logLevel: "info",
  runtime: { limits: { http: 8, db: 4 } },
})
```

A `vibe.config.ts` and a hand-written `createSystem(config)` are two spellings of
one thing; pick whichever fits. The config file resolves as
`vibe.config.{ts,mts,cts,js,mjs,cjs}` and TypeScript is loaded natively (no build
step).

## The `vibe/config` package — the resolver

A dedicated package so the resolver is testable and reusable, and so
`defineConfig`'s types and the `VibeConfig` schema live in one place. It provides:

- `defineConfig(config: VibeConfig): VibeConfig` — the typed identity helper for
  `vibe.config.ts`.
- `loadConfig(options?): Promise<ResolvedConfig>` — discovers, transpiles,
  validates, and normalizes a `vibe.config.*` file.
- `mergeConfig(base, override)` — deterministic deep-merge, used to layer
  defaults → config → env → overrides.

Whether config comes from a `vibe.config.ts` or a direct `createSystem` call, it
runs through the same validate/normalize path — so there is one code path and one
source of truth regardless of which surface you wrote.

## The `VibeConfig` schema

Whether it comes from `defineConfig` or a direct `createSystem` call, configuration
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

  /** Tools — usually attached to agents via their `tools` array. */
  tools?: Tool[]

  /** Agents — built with `defineAgent`; resolvable by name. */
  agents?: Record<string, AgentConfig>

  /** Plugins — dependency-ordered by the host. */
  plugins?: Plugin[]

  /** Memory backend + context/budget policy. */
  memory?: MemoryConfig

  /** Logging. */
  logLevel?: LogLevel                    // default: "info"

  /** Runtime defaults applied to model & tool executions. */
  runtime?: {
    retry?: Partial<RetryPolicy>         // default: vibe/runtime defaultRetryPolicy
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
[`vibe/runtime`](./05-runtime-execution.md), `agent` →
[the agent loop](./09-agent-loop.md). Config is a thin, declarative front for
wiring that already exists — it does not introduce a second way to do things, it
removes the boilerplate.

`defineAgent` carries its own `tools`, so the `agents` map already knows its wiring
— you compose typed values, you don't hand-list edges twice.

Resolution validates the object (a Zod schema under the hood) and fails **loudly
with a typed error** on a bad config — a missing provider key, an unknown model
id, a plugin dependency that isn't present — so misconfiguration surfaces at
build/boot, not mid-run. Because the surface is TypeScript, `defineConfig` and
`defineAgent` also catch many of these at compile time in your editor.

## Discovery & precedence

Configuration is layered, lowest → highest:

1. **Framework defaults** (`claude-opus-4-8`, adaptive thinking, `logLevel:
   "info"`, default retry policy).
2. **`vibe.config.*`** — the project's declared config.
3. **Environment variables** (`VIBE_*` and known keys like `ANTHROPIC_API_KEY`,
   `LOG_LEVEL`) — see [`.env.example`](../../.env.example).
4. **Explicit overrides** — e.g. a `--log-level` flag on the CLI, or overrides
   passed to `createSystem` when embedding the runtime directly.

Higher layers win. `loadConfig` walks up from `cwd` and takes the first match in
the order `vibe.config.ts → .mts → .cts → .js → .mjs → .cjs`. **Missing config is
fine** — defaults apply and `name` falls back to the nearest `package.json` `name`.
Config is progressive, not mandatory.

## Bootstrap flow — the CLI is the entry point

You do not write a `vibe.boot()`. `@frontal-labs/vibe-cli` is the entry point: it resolves
config, calls `createSystem(...)` on the runtime, and runs it.

```
vibe.config.ts  (defineConfig default)         createSystem(config)  (embedded)
        │                                                │
        └──────────────┬─────────────────────────────────┘
                       ▼   resolve to VibeConfig
        vibe/config.loadConfig()
        discover → transpile → validate → normalize
                       │
                       ▼   merge with env + explicit overrides   (mergeConfig)
                   ResolvedConfig
                       │
                       ▼   vibe/core.createSystem(resolved)
        build container · lifecycle · logger · plugin host · runtime
        register provider, tool registry, memory as DI tokens
                       │
                       ▼   system.start()   (init → start; plugins; provider warm-up)
                   started System  ──▶  ask() · agent() · stop()
```

- **`vibe dev`** — watch + run: resolves config, starts the system with verbose
  logs, and hot-reloads on change.
- **`vibe build`** — build for production with `vibe/build`, which code-splits
  tools into lazily-loaded chunks for small cold starts.

See [Developer experience](../dx/00-developer-experience.md) for the full CLI.

## Embedding the runtime directly

The bootstrap the CLI drives is an ordinary `createSystem(resolved)` call against
[`vibe/core`](../../packages/core/src/system.ts). That runtime entry point is a
**first-class, supported way to embed Vibe directly** — for people who want to run
the runtime inside an existing app rather than use the CLI:

```ts
import { createSystem } from "vibe/core"

const system = createSystem({
  name: "support-bot",
  logLevel: "debug",
  // provider, tools, plugins, runtime limits — the resolved VibeConfig shape
})

await system.start()   // ✅ lifecycle, logger, plugins work today
// system.ask(...) is 🚧 until the agentic layer is wired
await system.stop()
```

`vibe.config.ts` is the ergonomic front; `createSystem` is the seam underneath. Use
the config file for new projects; reach for `createSystem` when you're embedding the
runtime into something that already exists.

## Why this is the right shape

- **Config lives with the code it configures.** A `vibe.config.ts` sits beside the
  `defineAgent`/`defineTool` values it wires — one file, one mental model — and it
  is plain TypeScript all the way down.
- **Config is declarative wiring, not a DSL.** Every field resolves to an existing
  DI registration or runtime option. There is exactly one mental model.
- **Typed to the edges.** `defineConfig`, `defineAgent`, and `defineTool` give
  autocomplete and compile-time checking, and resolution re-validates with Zod, so
  a bad model id or an unused tool is caught before it can surface at runtime.
- **Progressive.** No config → sensible defaults. A little config → a real agent.
  Full config → named agents, custom providers, tuned runtime limits.

See the [Quickstart](../dx/03-quickstart.md) for the end-to-end flow,
[Agent spec](../specs/agent-spec.md) for the agent surface, and
[Build plan → Phase 5b](../plan/01-build-plan.md) for where `vibe/config` and the
build tooling land in the build order.
