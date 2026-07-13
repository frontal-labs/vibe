---
title: "Quickstart"
description: "From nothing to a tool-using, custom-model agent — in plain TypeScript with @vibe/core."
---

# Quickstart

From nothing to a tool-using, custom-model agent — in plain **TypeScript**. You
write ordinary `.ts` files that import from `@vibe/core` (`createSystem`,
`defineTool`, `createAgent`); `vibe dev` runs them on the runtime and `vibe build`
bundles them for production. This page is meant to be read top to bottom and
copy-pasted.

> **Honesty first.** The runtime foundation (`System`, DI, lifecycle, plugins,
> runtime, errors, logging) is **built and tested today**. The **agentic layer**
> behind the agent loop and `system.ask()` is **planned** and marked 🚧.
> `system.ask()` currently throws `notImplementedError` on purpose. The `@vibe/*`
> APIs you compose against are real; the loop that drives them is still landing.

## Prerequisites

- **Node.js ≥ 20**
- **bun** (the repo's package manager)
- An **`ANTHROPIC_API_KEY`** for anything that actually calls a model (🚧 steps)

## 1. Scaffold a project

`vibe new` scaffolds a plain-TypeScript project the way `create-next-app` does. The
`vibe` CLI is a TypeScript CLI (`vibe new`/`dev`/`build`), not a language compiler:

```bash
vibe new support-bot
cd support-bot
```

You get an ordinary TypeScript layout:

```
support-bot/
  src/
    support.ts          # your agent, tools, and system wiring
    db.ts               # your own TypeScript (imported by tool bodies)
  vibe.config.ts        # project config (defineConfig)
  package.json
  dist/                 # vibe build output
```

`@vibe/core` is a normal dependency in your `package.json` — you import it directly.

## 2. Write `support.ts`

One TypeScript module holds the tools, the agent, and the system wiring. You call
the `@vibe/core` factories directly — `defineTool`, `createAgent`, `createSystem`:

```ts
// src/support.ts
import { createAgent, createSystem, defineTool } from "@vibe/core"

import { db } from "./db"

/** Look up the current status of a customer order by id. */
const getOrder = defineTool({
  name: "GetOrder",
  description: "Look up the current status of a customer order by id.",
  schema: {
    orderId: { type: "string", description: "The order id, e.g. '1024'." },
  },
  async execute({ orderId }) {
    const order = await db.orders.find(orderId)
    if (!order) return { status: "not_found" }
    return { status: order.status, eta: order.eta }
  },
})

const support = createAgent({
  name: "Support",
  model: "claude-opus-4-8", // default model
  system: "You are a concise support agent. Use tools before guessing.",
  tools: [getOrder],
})

export const system = createSystem({
  name: "support-bot",
  logLevel: "info",
  agents: [support],
})
```

That is the entire application. Three things are worth calling out:

- **`createSystem({...})` is the composition root** and a config surface. You can
  configure the system here, keep a `vibe.config.ts` alongside it, or both. See
  [Configuration & bootstrap](../architecture/14-configuration-and-bootstrap.md).
- **`import { db } from "./db"`** brings your own TypeScript into the tool body.
  Your types flow through and are checked by the real TS compiler.
- **`tools: [getOrder]`** is the wiring — you pass the tool into the agent
  explicitly. There's one surface here: plain TypeScript calling `@vibe/*` APIs.

Your `db.ts` is just TypeScript:

```ts
// src/db.ts
export const db = {
  orders: {
    async find(id: string) {
      // your real data access
      return { status: "shipped", eta: "2026-07-14" }
    },
  },
}
```

## 3. Run it with `vibe dev` (🚧)

`vibe dev` runs your project on the runtime, watches for changes, and drives the
entry agent — one command, like `next dev`:

```bash
vibe dev
```

Run it today and you'll see the runtime's structured startup/shutdown logs and a
`notImplementedError` from the agent loop — proof the lifecycle and logger are real
while the loop (`system.ask()` / `agent.run`) is still 🚧. See the
[Agent loop](../architecture/09-agent-loop.md) for what it will do.

## 4. Swap a sub-agent's model

Add a cheaper triage agent and let `Support` delegate to it. Swapping a model is a
one-line change — no rewrite, no re-registration:

```ts
// src/support.ts (continued)

const triage = createAgent({
  name: "Triage",
  model: "claude-haiku-4-5", // cheap fan-out
  system: "Classify the request and route it.",
  tools: [getOrder],
})

const support = createAgent({
  name: "Support",
  model: "claude-opus-4-8",
  system: "You are a concise support agent. Use tools before guessing.",
  tools: [getOrder],
  agents: [triage], // wiring a sub-agent works much like a tool
})
```

Pick the model per job from the
[catalog](../specs/model-spec.md#model-catalog-defaults): `claude-opus-4-8`
(default, most capable), `claude-sonnet-4-6` (balanced), `claude-haiku-4-5`
(cheap fan-out), `claude-fable-5` (hardest runs). Change one `model` field and that
agent follows — one edit.

## 5. Build (🚧)

`vibe build` bundles the whole project to `dist/` for production via `@vibe/build`.
When the optional `vibe_bundler` native addon is present, `@vibe/build` uses it to
statically analyze your agent/tool modules and code-split tools into lazily loaded
chunks; without it, the build still works, just without that acceleration:

```bash
vibe build
```

Because everything is ordinary TypeScript, `tsc`/your editor already give you full
type-checking and diagnostics as you write — there's no separate language check to
run.

## Configuration

Configure the project with a `vibe.config.ts` using `defineConfig`, and/or inline
in `createSystem({...})` — both are supported:

```ts
// vibe.config.ts
import { defineConfig } from "@vibe/core"

export default defineConfig({
  name: "support-bot",
  logLevel: "info",
})
```

See [Configuration & bootstrap](../architecture/14-configuration-and-bootstrap.md).

## What's built vs planned

| Piece | Status |
|---|---|
| Runtime foundation — `createSystem`, lifecycle, logger, plugins, runtime, DI, typed errors | ✅ Built (in `@vibe/core` and friends) |
| Plugins (manifest + `setup(hooks)`, dependency-ordered) | ✅ Built |
| `@vibe/build` + optional `vibe_bundler` native addon (tool code-splitting) | 🚧 In progress |
| The **agentic layer** — agent loop, `system.ask()`, tool execution, model providers | 🚧 Planned |

The runtime is built and tested today; `@vibe/build` and the agentic layer are the
planned work on top.

## Where to go next

- [Developer experience](./00-developer-experience.md) — the mental model.
- [API design](./01-api-design.md) — the factory-function surface, with examples.
- [Type safety](./02-type-safety.md) — how types flow through tools and agents.
- [Configuration & bootstrap](../architecture/14-configuration-and-bootstrap.md) — `vibe.config.ts` vs `createSystem({...})`.
- [Agent spec](../specs/agent-spec.md) · [Tool spec](../specs/tool-spec.md) ·
  [Model spec](../specs/model-spec.md) — the runtime contracts you compose against.
