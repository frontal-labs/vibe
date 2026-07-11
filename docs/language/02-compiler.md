# The Vibe Compiler

> 🚧 Planned. A source-to-source compiler: `.vibe` in, TypeScript out. It is
> deliberately unglamorous — a classic pipeline emitting code onto the documented
> [`@vibe/*` runtime](../architecture/00-overview.md), so nothing about it is magic
> and every output is readable.
>
> **Implemented in Rust.** The compiler lives in the `crates/` Cargo workspace
> (`vibe_lexer` → `vibe_parser` → `vibe_binder` → `vibe_checker` → `vibe_emit`,
> wired by `vibe_compiler`), following the SWC/Biome/oxc playbook. See
> [The compiler is written in Rust](./05-rust-implementation.md). The stage names
> below map 1:1 to those crates.

## Pipeline

```
.vibe source
   │
   ▼ 1. Lex          → tokens
   ▼ 2. Parse        → Vibe AST (declarations) with embedded TS spans
   ▼ 3. Bind         → symbol table (tools, agents, models, memories, plugins)
   ▼ 4. Check        → semantic + type analysis (TS Compiler API for embedded code)
   ▼ 5. Emit         → TypeScript (+ .d.ts + source map)
   │
   ▼ tsc / esbuild   → JavaScript
   ▼ @vibe/* runtime → running agent
```

Stages 1–5 are `@vibe/compiler`; the last two are the standard TS toolchain the
emitted code feeds into.

### 1. Lex
Produces tokens for Vibe keywords (`agent`, `tool`, `model`, `use`, …), punctuation,
strings (including triple-quoted with `${}` spans), and **opaque TypeScript spans**
— the compiler does not re-tokenize TS itself; it captures byte ranges of embedded
expressions/types/bodies and hands them to the TypeScript compiler API later.

### 2. Parse
Builds the Vibe AST: a list of declaration nodes (`ToolDecl`, `AgentDecl`,
`ModelDecl`, `MemoryDecl`, `PluginDecl`, `ConfigDecl`, `ImportDecl`). Each node keeps
source positions for diagnostics and source maps. TS spans (param types, return
type, tool body, prompt interpolations, plugin bodies) are stored as unparsed
ranges plus a parsed TS AST obtained from the TS API.

### 3. Bind
Walks the AST and builds a **symbol table**: every `tool`/`agent`/`model`/`memory`/
`plugin` name, its exports, and the `use` edges (agent → tool, agent → sub-agent,
agent → plugin). This is what makes agent-aware diagnostics possible.

### 4. Check
Two layers of analysis:

- **Type checking (a delegated back-end pass).** The Rust front end does **not**
  host the TypeScript type system. Embedded spans — parameter types, return types,
  tool bodies, prompt `${}` interpolations, plugin bodies — are checked by
  **TypeScript itself**, run over the emitted `.ts` (`tsc --noEmit`, or a warm
  `tsserver` in the editor). The resulting `TSxxxx` diagnostics are re-anchored to
  `.vibe` positions via the source map the [emitter](#5-emit) produces. So there are
  two type systems, cleanly split: **Vibe semantics in Rust, embedded code in
  TypeScript.** See [Rust implementation → type checking](./05-rust-implementation.md#type-checking-a-rust-front-end-a-typescript-back-end).
- **Semantic checking (Vibe-specific).** The rules a library cannot express:
  - `use X` refers to a declared `tool`/`agent`/`plugin`.
  - A `tool` that is never `use`d by any agent → warning (dead tool).
  - `model` ids resolve to the [catalog](../specs/model-spec.md) (unknown id → error
    with a "did you mean" suggestion).
  - No `use` cycles among agents beyond the allowed delegation depth.
  - Exactly one `config` per project; required fields present.
  - Parameter types are expressible as a tool JSON Schema (rejects unsupported
    shapes with a clear message).

### 5. Emit
Generates, per input file:

- **`<name>.vibe.ts`** — the TypeScript that calls the runtime (`defineTool`,
  `createAgent`, `createSystem`, `createPluginHost`, …). Human-readable and
  committed-to-gitignore.
- **`<name>.vibe.d.ts`** — declarations so `.ts` code can import the tools/agents.
- **`<name>.vibe.ts.map`** — a source map from emitted TS back to `.vibe`, so stack
  traces and debugger breakpoints land in your `.vibe` source.

## Codegen: what each construct emits

The target is the runtime documented in [Architecture](../architecture/00-overview.md).
Illustrative mappings:

| Vibe | Emitted TypeScript (shape) |
|---|---|
| `tool T(p: P) -> R { body }` | `export const T = defineTool({ name:"T", description, schema: z.object({p: …}), async execute({p}, ctx){ body } })` |
| `agent A { model m; system s; use T }` | `export const A = createAgent({ model: m, system: s, tools: [T] })` |
| `model M { id …; effort … }` | `const M = { model: "…", effort: "…" } satisfies ModelConfig` |
| `memory Mem { kind …; budget … }` | `const Mem = createMemory({ … })` |
| `plugin P { on start { … } }` | `const P: Plugin = { manifest:{…}, setup(h){ h.onBefore("start", async () => { … }) } }` |
| `config { … }` | `export default defineConfig({ … })` |

Parameter types become Zod schemas via a **type → schema lowering** (the same
mapping the [tool spec](../specs/tool-spec.md) describes): `string → z.string()`,
`number → z.number()`, object/array/union/enum/optional handled structurally,
`@desc("…")` → `.describe("…")`. Types the schema layer can't express are rejected
at Check, not silently dropped.

## Source maps & debugging

Every emitted line carries a mapping to its `.vibe` origin. Runtime stack traces,
debugger breakpoints, and error `.stack` values resolve to `.vibe:line:col`. A
tool that throws shows the failure at the `return`/`await` in your `.vibe` body, not
in generated code you never wrote.

## Incremental & watch

- **Per-file compilation with a dependency graph.** Editing one `.vibe` recompiles
  it and anything that `use`s or imports it; unaffected files are cached.
- **Watch mode** (`vibe dev`) keeps a warm compiler + TS program and recompiles on
  change in milliseconds, then hot-reloads the running system where safe.
- The compiler is also the engine behind the [language server](./03-toolchain.md) —
  the same Bind/Check phases power diagnostics, completion, and hover, so the editor
  and the CLI never disagree.

## Diagnostics

Errors are Vibe-aware and point at `.vibe` source. Examples:

```
support.vibe:14:9  error  VB2001  Unknown model id 'claude-opus-4.8'.
                                  Did you mean 'claude-opus-4-8'?
support.vibe:22:7  warning VB3010 Tool 'RefundOrder' is declared but never used
                                  by any agent.
support.vibe:31:3  error  VB2100  'use Escalation' — no tool, agent, or plugin
                                  named 'Escalation' is in scope.
orders.vibe:8:12   error  TS2345  (from tool body) Argument of type 'number' is
                                  not assignable to parameter of type 'string'.
```

Vibe diagnostics use `VBxxxx` codes; embedded-TypeScript errors keep their `TSxxxx`
codes but are re-anchored to `.vibe` positions. This is the payoff of a language
over a library: the compiler understands agents, tools, and models as first-class
concepts and can check them as such.

## Output layout

```
project/
  support.vibe
  vibe.config.ts | config { } in a .vibe
  .vibe/                 ← generated (gitignored)
    support.vibe.ts
    support.vibe.d.ts
    support.vibe.ts.map
  dist/                  ← tsc/esbuild output (for vibe build)
```

`vibe dev` runs from `.vibe/`; `vibe build` produces `dist/`. You never edit
`.vibe/` — it is a build artifact, like `tsc`'s `outDir`.

## Relationship to `tsc`

Vibe does not replace `tsc`; it **precedes** it. `.vibe` → `.ts` (Vibe compiler)
→ `.js` (`tsc`/esbuild). Type checking of your embedded code *is* `tsc`, invoked via
the compiler API, so there is one type system and one source of truth for type
errors. See [TypeScript interop](./04-typescript-interop.md).
