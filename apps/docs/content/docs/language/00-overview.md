---
title: "The Vibe Language"
description: "TypeScript didn't become a framework by being a library you import. It became one"
---

# The Vibe Language

> 🚧 Planned. Vibe is a **compiled language for agents**: you write `.vibe` files,
> and the `vibe` compiler turns them into TypeScript, which runs on the `@vibe/*`
> runtime. You never `import` the framework — the compiler emits the wiring, the
> same way `tsc` emits JavaScript you never hand-write.

## The mental model: Vibe is to agents what TypeScript is to JavaScript

TypeScript didn't become a framework by being a library you import. It became one
by **adding syntax and structure on top of the language** and shipping a compiler,
a language server, and editor tooling. Write `.ts`, run `tsc`, get `.js`.

Vibe takes the same shape one level up:

```
  .vibe  ──▶  vibe compiler  ──▶  .ts  ──▶  tsc / esbuild  ──▶  .js  ──▶  @vibe/* runtime
```

- **`.vibe`** — the language you write. New top-level constructs — `agent`, `tool`,
  `model`, `memory`, `plugin`, `config` — plus ordinary TypeScript expressions
  inside them.
- **The `vibe` compiler** — lexes, parses, type-checks (reusing TypeScript's type
  system for embedded expressions), and **emits TypeScript** that calls the
  `@vibe/*` runtime.
- **The `@vibe/*` runtime** — the packages documented elsewhere in
  [Architecture](../architecture/00-overview.md) (`agent`, `tools`, `model`,
  `runtime`, `lifecycle`, …). It is the **compile target**, not the surface. You
  don't import it; the emitted code does.

This is why Vibe *feels* like a framework and not a library: the primitives are
**language constructs**, not function calls you look up and import.

## What you write

A whole agent, tools and all, in one declarative file — no imports of the
framework, no wiring:

```vibe
// support.vibe
import { db } from "./db"          // interop: import your own TypeScript

config {
  name: "support-bot"
  logLevel: info
}

tool GetOrder(orderId: string) -> OrderStatus {
  // the body is ordinary TypeScript, type-checked
  const order = await db.orders.find(orderId)
  return order ?? { status: "not_found" }
}

agent Support {
  model  claude-opus-4-8
  effort high
  system "You are a concise support agent. Use tools before guessing."
  use    GetOrder
}
```

Then:

```bash
vibe dev        # compile + watch + run
vibe build      # compile .vibe → .ts → .js
```

That is the entire application. `use GetOrder` is the wiring. `model claude-opus-4-8`
is the provider config. There is no `import { defineTool } from "..."`, no
`createAgent(...)`, no container setup — the compiler writes all of it.

## What it compiles to

The compiler is not magic; it is a **source-to-source transform** onto the runtime
you can read today. The `tool` above emits, roughly:

```ts
// .vibe.generated.ts  (you never edit this)
import { defineTool } from "@vibe/tools"
import { z } from "zod"
import { db } from "./db"

export const GetOrder = defineTool({
  name: "GetOrder",
  schema: z.object({ orderId: z.string() }),
  async execute({ orderId }, ctx) {
    const order = await db.orders.find(orderId)
    return order ?? { status: "not_found" }
  },
})
```

and the `agent`/`config` emit `createAgent(...)` / `createSystem(...)` calls.
Because the target is the documented `@vibe/*` runtime, **every architecture
guarantee still holds** — the [agent loop](../architecture/09-agent-loop.md),
[typed errors](../architecture/07-errors.md), the
[durable runtime](../architecture/05-runtime-execution.md), the
[model layer](../architecture/10-model-provider-layer.md). The language is a nicer
front for the same machine.

## Why a language and not just a library

| Goal | A library gives you | The Vibe language gives you |
|---|---|---|
| No boilerplate | `defineTool({...})`, imports, wiring | `tool GetOrder(...) {...}` — the wiring is implicit |
| Framework feel | You assemble parts | Declarations *are* the app |
| First-class diagnostics | TypeScript errors about your calls | Agent-aware errors: "tool `GetOrder` is never `use`d by any agent" |
| Editor support | Types + autocomplete on functions | Syntax highlighting, hovers on `model`, go-to-`tool`, completion of model ids |
| One artifact per concept | A file that exports objects | A `tool`/`agent` block that reads like a definition |

The language can say things a library cannot — it *knows* what an agent, a tool,
and a model are, so its compiler and language server can check and complete them
as domain concepts, not as generic function arguments.

## What stays TypeScript

Vibe is a **superset in spirit**: everything inside a `tool` body, every type
annotation, and every `import` is ordinary TypeScript. The Rust front end doesn't
type-check it in-process — it emits `.ts` and delegates checking to the real
TypeScript compiler (`tsc`), re-anchoring diagnostics to `.vibe` via source maps.
You bring your existing code (`import { db } from "./db"`), your types flow through,
and the output is plain `.ts`/`.js`. See
[TypeScript interop](./04-typescript-interop.md) and
[Rust implementation → type checking](./05-rust-implementation.md#type-checking-a-rust-front-end-a-typescript-back-end).

## The pieces

The language ships as a toolchain, mirroring TypeScript's. The compiler and its
tooling are **implemented in Rust** — for the same reasons SWC, Biome, oxc, and Ruff
are: raw speed on every keystroke and build, and single-binary distribution with no
runtime toolchain to install. The Rust front end emits TypeScript that runs on the
`@vibe/*` runtime; nothing Rust ships inside the deployed agent. See
[Rust implementation](./05-rust-implementation.md).

- **`vibe_compiler` (Rust crate)** — lexer, parser, binder, checker, emitter; embedded
  TS is checked by delegating to `tsc`. See [The compiler](./02-compiler.md).
- **`vibe` CLI (Rust binary)** — `build`, `dev`, `check`, `fmt`, `new`, `info`. See
  [Toolchain](./03-toolchain.md).
- **`vibe_lsp` (Rust binary)** — `tower-lsp` language server: diagnostics, completion,
  hover, go-to-def, reusing the compiler's binder/checker crates.
- **Editor extension** — syntax highlighting + LSP client (VS Code first).
- **`@vibe/*` runtime** — the compile target (existing architecture docs), consumed by
  the emitted `.ts` and distributed as ordinary npm packages.

## Where to go next

- [Syntax](./01-syntax.md) — every construct, with examples.
- [The compiler](./02-compiler.md) — pipeline, codegen, source maps.
- [Toolchain](./03-toolchain.md) — the `vibe` CLI, LSP, and editor extension.
- [TypeScript interop](./04-typescript-interop.md) — how `.vibe` and `.ts` mix.
- [Grammar](../specs/grammar.md) — the formal grammar.
