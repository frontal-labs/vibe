# Quickstart

From nothing to a tool-using, custom-model agent — written in the **Vibe
language**. You write `.vibe`; the `vibe` compiler turns it into TypeScript that
runs on the `@vibe/*` runtime, the same way `tsc` turns `.ts` into `.js`. You do
**not** import the framework — the compiler emits the wiring. This page is meant
to be read top to bottom and copy-pasted.

> **Honesty first.** The runtime foundation (`System`, DI, lifecycle, plugins,
> runtime, errors, logging) is **built and tested today** — it is the compile
> target. The **language and its compiler** (`.vibe` syntax, `vibe new/dev/build/
> check/fmt`) and the **agentic layer** behind the agent loop and `system.ask()`
> are **planned** and marked 🚧. `system.ask()` currently throws
> `notImplementedError` on purpose. The `.vibe` snippets below are the target
> language; the runtime they compile onto is real.

## Prerequisites

- **Node.js ≥ 20**
- **bun** (the repo's package manager)
- An **`ANTHROPIC_API_KEY`** for anything that actually calls a model (🚧 steps)

## 1. Scaffold a project (🚧)

There is nothing to `bun add` into your app — you don't import `@vibe/*`, you
compile onto it. `vibe new` scaffolds a project the way `cargo new` or
`create-next-app` does:

```bash
vibe new support-bot
cd support-bot
```

You get a language-first layout:

```
support-bot/
  support.vibe          # your agent, tools, and config — the whole app
  db.ts                 # your ordinary TypeScript (imported by tool bodies)
  vibe.config.ts        # optional — a config block in .vibe works too (see step 2)
  package.json
  .vibe/                # generated .ts/.d.ts/source-maps (gitignored) — never edit
  dist/                 # vibe build output
```

The `@vibe/*` runtime is a dependency of the **compile target**, not something
your source imports. See [The Vibe language](../language/00-overview.md).

## 2. Write `support.vibe`

One declarative file holds the config, the tools, and the agent. No imports of
the framework, no wiring — `use` *is* the wiring.

```vibe
// support.vibe
import { db } from "./db"          // interop: import your own TypeScript

config {
  name      "support-bot"
  logLevel  info
  provider  anthropic              // reads ANTHROPIC_API_KEY from env
}

/// Look up the current status of a customer order by id.
tool GetOrder(orderId: string @desc("The order id, e.g. '1024'.")) -> OrderStatus {
  // the body is ordinary TypeScript, type-checked against ./db
  const order = await db.orders.find(orderId)
  if (!order) return { status: "not_found" }
  return { status: order.status, eta: order.eta }
}

agent Support {
  model  claude-opus-4-8           // default model; catalog id completed by the LSP
  effort high
  system "You are a concise support agent. Use tools before guessing."
  use    GetOrder                  // wire the tool into the agent
}
```

That is the entire application. Three things are worth calling out:

- **`config { }` is the config surface.** You can put it in any `.vibe` file, or
  keep a `vibe.config.ts` instead — both are supported. See
  [Configuration & the compiler entry points](../architecture/14-configuration-and-bootstrap.md).
- **`import { db } from "./db"`** brings your own TypeScript into the tool body.
  Your types flow through; the body is type-checked by the real TS compiler.
- **`use GetOrder`** is the wiring. There is no `defineTool({...})`, no
  `createAgent(...)`, no container setup — the compiler emits all of it. (The old
  `import { defineTool } from "vibe"` library style is gone; the surface is now
  `.vibe` syntax.)

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

## 3. Run it with `vibe dev` (🚧)

`vibe dev` compiles `.vibe` → `.ts`, type-checks the embedded TypeScript, wires
it onto the runtime, watches for changes, and runs the entry agent — one command,
like `next dev`:

```bash
vibe dev
```

Under the hood it lexes, parses, binds, checks, and **emits TypeScript** that
calls the runtime (`defineTool`, `createAgent`, `createSystem`), then runs it.
Run it today and you'll see the runtime's structured startup/shutdown logs and a
`notImplementedError` from the agent loop — proof the lifecycle and logger are
real while the loop (`system.ask()` / `agent.run`) is still 🚧. See
[The compiler](../language/02-compiler.md) for exactly what it emits.

## 4. Swap a sub-agent's model

Add a cheaper triage agent and let `Support` delegate to it. Swapping a model is
a one-line change — no rewrite, no re-registration:

```vibe
// support.vibe (continued)

model Fast {
  id     claude-haiku-4-5          // cheap fan-out
  effort low
}

agent Triage {
  model Fast                        // reference the named model config
  system "Classify the request and route it."
  use    GetOrder
}

agent Support {
  model  claude-opus-4-8
  effort high
  system "You are a concise support agent. Use tools before guessing."
  use    GetOrder
  use    Triage                     // wiring a sub-agent works exactly like a tool
}
```

Pick the model per job from the
[catalog](../specs/model-spec.md#model-catalog-defaults): `claude-opus-4-8`
(default, most capable), `claude-sonnet-4-6` (balanced), `claude-haiku-4-5`
(cheap fan-out), `claude-fable-5` (hardest runs). Change `model Fast { id … }`
and every agent that references `Fast` follows — one edit.

## 5. Check and build (🚧)

`vibe check` is the "does my agent even compile?" pre-flight — it runs the full
lexer/parser/checker (including agent-aware diagnostics like "tool declared but
never `use`d" and "unknown model id, did you mean…") plus the embedded-TypeScript
type check. It exits non-zero on error, so it's ideal for CI:

```bash
vibe check
```

`vibe build` compiles the whole project to `dist/` (`.vibe` → `.ts` → `.js`) for
production:

```bash
vibe build
```

And `vibe fmt` formats your `.vibe` sources, the way `gofmt`/`prettier` do:

```bash
vibe fmt
```

## Embedding the runtime directly (escape hatch)

The compiler's whole job is to emit code onto the `@vibe/*` runtime. If you'd
rather write that TypeScript by hand — embedding the runtime in an existing app
instead of shipping a `.vibe` project — you can call `createSystem` yourself. That
is the compile target, so everything still works, you just write the wiring the
compiler would have written. See
[Configuration & the compiler entry points](../architecture/14-configuration-and-bootstrap.md#embedding-the-runtime-directly).

## What's built vs planned

| Piece | Status |
|---|---|
| Runtime foundation — `createSystem`, lifecycle, logger, plugins, runtime, DI, typed errors | ✅ Built (in `@vibe/core` and friends) — the compile target |
| Plugins (manifest + `setup(hooks)`, dependency-ordered) | ✅ Built |
| The Vibe **language** — `.vibe` syntax (`agent`/`tool`/`model`/`memory`/`plugin`/`config`/`use`/`import`) | 🚧 Planned |
| The **compiler** — lex/parse/bind/check/emit, source maps (`@vibe/compiler`) | 🚧 Planned |
| The **toolchain** — `vibe new/dev/build/check/fmt`, LSP, editor extension | 🚧 Planned |
| The **agentic layer** — agent loop, `system.ask()`, tool execution, model providers | 🚧 Planned |

The runtime that all of the above compiles onto is built and tested today; the
language, compiler, and agentic layer are the planned work on top.

## Where to go next

- [The Vibe language](../language/00-overview.md) — the mental model.
- [Syntax](../language/01-syntax.md) — every construct, with examples.
- [The compiler](../language/02-compiler.md) — pipeline, codegen, source maps.
- [Toolchain](../language/03-toolchain.md) — the `vibe` CLI, LSP, editor extension.
- [Grammar](../specs/grammar.md) — the formal `.vibe` grammar.
- [Configuration & the compiler entry points](../architecture/14-configuration-and-bootstrap.md) — `config { }` vs `vibe.config.ts`.
- [Agent spec](../specs/agent-spec.md) · [Tool spec](../specs/tool-spec.md) ·
  [Model spec](../specs/model-spec.md) — the runtime contracts the compiler targets.
