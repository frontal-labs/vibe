# Quickstart

From nothing to a tool-using, custom-model agent — written in **plain
TypeScript**. Vibe is a TypeScript-native agent framework: you import `@vibe/*`
APIs (`defineTool`, `defineAgent`, `createSystem`) and write ordinary `.ts`
files. There is no separate language and no compiler — you run your app with
`node`/`bun` (or the `@vibe/cli`) and build it for production with `@vibe/build`.
This page is meant to be read top to bottom and copy-pasted.

> **Honesty first.** The runtime foundation (`System`, DI, lifecycle, plugins,
> runtime, errors, logging) is **built and tested today**. The **agentic layer**
> behind the agent loop and `system.ask()` is **planned** and marked 🚧.
> `system.ask()` currently throws `notImplementedError` on purpose. The API
> shapes below are the target surface; the runtime underneath is real.

## Prerequisites

- **Node.js ≥ 20**
- **bun** (the repo's package manager)
- An **`ANTHROPIC_API_KEY`** for anything that actually calls a model (🚧 steps)

## 1. Create a project

A Vibe app is a normal TypeScript project that depends on `@vibe/*`. Add the
barrel package (which re-exports the framework surface) and a config:

```bash
mkdir support-bot && cd support-bot
bun init -y
bun add @vibe/core @vibe/tools @vibe/agent
```

A minimal layout:

```
support-bot/
  support.ts            # your agent, tools, and wiring — the whole app
  db.ts                 # your ordinary TypeScript (imported by tool bodies)
  vibe.config.ts        # optional — framework config
  package.json
  dist/                 # @vibe/build output
```

You import the framework directly. See
[Configuration & bootstrap](../architecture/14-configuration-and-bootstrap.md).

## 2. Write `support.ts`

One TypeScript file holds the tools, the agent, and the wiring. You define tools
with `defineTool`, define agents with `defineAgent`, and compose them into a
runnable system with `createSystem`.

```ts
// support.ts
import { z } from "zod"

import { createSystem } from "@vibe/core"
import { defineAgent } from "@vibe/agent"
import { defineTool } from "@vibe/tools"

import { db } from "./db" // interop: import your own TypeScript

/** Look up the current status of a customer order by id. */
const getOrder = defineTool({
  name: "GetOrder",
  description: "Look up the current status of a customer order by id.",
  schema: z.object({
    orderId: z.string().describe("The order id, e.g. '1024'."),
  }),
  async execute({ orderId }) {
    // the body is ordinary TypeScript, type-checked against ./db
    const order = await db.orders.find(orderId)
    if (!order) return { status: "not_found" }
    return { status: order.status, eta: order.eta }
  },
})

const support = defineAgent({
  name: "Support",
  model: "claude-opus-4-8", // default model
  effort: "high",
  system: "You are a concise support agent. Use tools before guessing.",
  tools: [getOrder], // wire the tool into the agent
})

export const system = createSystem({
  name: "support-bot",
  logLevel: "info",
  agents: [support],
})
```

That is the entire application. Three things are worth calling out:

- **`createSystem({...})` is the composition root.** It takes your config
  (`name`, `logLevel`, `agents`) and returns a runnable `System`. You can also
  keep framework config in a `vibe.config.ts` via `defineConfig` — see
  [Configuration & bootstrap](../architecture/14-configuration-and-bootstrap.md).
- **`import { db } from "./db"`** brings your own TypeScript into the tool body.
  Your types flow through; the whole file is type-checked by the TS compiler.
- **`tools: [getOrder]`** is the wiring — you pass the tool object into the
  agent. There is no code generation; the wiring is explicit TypeScript.

Your `db.ts` is just TypeScript:

```ts
// db.ts
export const db = {
  orders: {
    async find(id: string) {
      // your real data access
      return { status: "shipped", eta: "2026-07-14" }
    },
  },
}
```

## 3. Run it

Because it's plain TypeScript, you run it however you run any TS app — with
`bun`, or with `node` after a build. Add a small entrypoint that starts the
system and asks the agent something:

```ts
// main.ts
import { system } from "./support"

await system.start()
const answer = await system.ask("Where is order 1024?")
console.log(answer)
await system.stop()
```

```bash
bun run main.ts
```

Run it today and you'll see the runtime's structured startup/shutdown logs and a
`notImplementedError` from the agent loop — proof the lifecycle and logger are
real while the loop (`system.ask()` / agent run) is still 🚧.

The `@vibe/cli` (a TypeScript CLI) wraps the same flow for convenience once the
agentic layer lands.

## 4. Swap a sub-agent's model

Add a cheaper triage agent and let `Support` delegate to it. Swapping a model is
a one-line change — no rewrite, no re-registration:

```ts
// support.ts (continued)

const triage = defineAgent({
  name: "Triage",
  model: "claude-haiku-4-5", // cheap fan-out
  effort: "low",
  system: "Classify the request and route it.",
  tools: [getOrder],
})

const support = defineAgent({
  name: "Support",
  model: "claude-opus-4-8",
  effort: "high",
  system: "You are a concise support agent. Use tools before guessing.",
  tools: [getOrder],
  agents: [triage], // wiring a sub-agent works like wiring a tool
})
```

Pick the model per job from the
[catalog](../specs/model-spec.md#model-catalog-defaults): `claude-opus-4-8`
(default, most capable), `claude-sonnet-4-6` (balanced), `claude-haiku-4-5`
(cheap fan-out), `claude-fable-5` (hardest runs). Change one `model:` field and
that agent follows — one edit.

## 5. Build for production

`@vibe/build` bundles your app for production, code-splitting tools into
lazily-loaded chunks so cold starts stay small. It analyzes your agent/tool
modules to build the dependency graph, then emits to `dist/`:

```bash
bun run build   # invokes @vibe/build
```

Typecheck and lint with the ordinary TypeScript toolchain (`tsc --noEmit`,
Biome) — the same gate the framework packages use.

## Embedding in an existing app

Because Vibe is a library, embedding it in an existing TypeScript app is the
normal case, not an escape hatch: import `@vibe/*`, call `createSystem`
yourself, and start/stop it alongside the rest of your process. See
[Configuration & bootstrap](../architecture/14-configuration-and-bootstrap.md#embedding-the-runtime-directly).

## What's built vs planned

| Piece | Status |
|---|---|
| Runtime foundation — `createSystem`, lifecycle, logger, plugins, runtime, DI, typed errors | ✅ Built (in `@vibe/core` and friends) |
| Plugins (manifest + `setup(hooks)`, dependency-ordered) | ✅ Built |
| The **agentic layer** — agent loop, `system.ask()`, tool execution, model providers | 🚧 Planned |

The runtime foundation is built and tested today; the agentic layer is the
planned work on top.

## Where to go next

- [Type safety](02-type-safety.md) — how inference flows through tools and agents.
- [Agent spec](../specs/agent-spec.md) · [Tool spec](../specs/tool-spec.md) ·
  [Model spec](../specs/model-spec.md) — the runtime contracts your app targets.
- [Configuration & bootstrap](../architecture/14-configuration-and-bootstrap.md) — `createSystem` vs `vibe.config.ts`.
- [Package topology](../architecture/02-package-topology.md) — how the `@vibe/*` packages fit together.
- [Agentic implementation plan](../plan/02-agentic-implementation-plan.md) — the phased build of the agent loop.
