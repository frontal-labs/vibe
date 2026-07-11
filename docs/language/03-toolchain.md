# The Vibe Toolchain

> 🚧 Planned. The tools you actually run and open your editor with. Vibe ships a
> toolchain that mirrors TypeScript's — a CLI (`vibe`, to `tsc`), a language server
> (`vibe_lsp`, to `tsserver`), an editor extension, and a formatter — all built on the
> one [`@vibe/compiler`](./02-compiler.md). The CLI and the language server are
> **Rust binaries** (the `vibe_cli` and `vibe_lsp` crates); because everything sits on
> the same Rust compiler crates, the CLI and the editor **never disagree**. See
> [Rust implementation](./05-rust-implementation.md).

TypeScript is not just a type system; it is a toolchain. `tsc` compiles and
type-checks, `tsserver` powers every editor's IntelliSense, and a thin editor
plugin wires them into VS Code. Vibe takes the identical shape one level up: the
[compiler](./02-compiler.md) does the Lex → Parse → Bind → Check → Emit work, and
the tools below are the surfaces you invoke it through.

```
                 ┌──────────────────────────────────────────┐
                 │            @vibe/compiler                 │
                 │   Lex · Parse · Bind · Check · Emit       │
                 └──────────────────────────────────────────┘
                    ▲            ▲               ▲
        vibe_cli ───┘      vibe_lsp ────────────┘   vibe_fmt
      build/dev/check/fmt  (tower-lsp: Bind+Check)  (canonical format)
```

---

## The `vibe` CLI

One binary, a handful of verbs. Each verb is a thin driver over the compiler; none
of them contain their own parser or checker.

`vibe` is a **prebuilt Rust binary** (the `vibe_cli` crate). It is distributed the
way [`@biomejs/biome`](https://biomejs.dev) is: a thin `vibe` npm launcher whose
`optionalDependencies` are per-platform packages (`@vibe/cli-darwin-arm64`,
`@vibe/cli-linux-x64-gnu`, `@vibe/cli-win32-x64`, …), each carrying the right binary,
so `bun add -D vibe` resolves the correct one. It is also installable outside npm via
`cargo install`, Homebrew, and `curl | sh`. See
[distribution](./05-rust-implementation.md#distribution-to-the-javascript-ecosystem).

| Command | What it does | Mirrors |
|---|---|---|
| `vibe new [name]` | Scaffold a project: a starter `.vibe`, `vibe.config.ts`, `tsconfig.json`, `.gitignore` (with `.vibe/`), and `package.json` wired to `@vibe/*`. | `tsc --init` + a template |
| `vibe dev` | Compile all `.vibe` → `.ts` in `.vibe/`, watch, hot-reload, and run the entry agent. Warm compiler + TS program for millisecond rebuilds. | `tsc --watch` + a runner |
| `vibe build` | Full compile `.vibe` → `.ts` → `.js` into `dist/`. Emits `.d.ts` and source maps. The release command. | `tsc` |
| `vibe check` | Type-check and semantic-check the whole compilation. Prints diagnostics; **non-zero exit** on any error. No emit. The CI command. | `tsc --noEmit` |
| `vibe fmt` | Format `.vibe` files in place (or `--check` for CI). Canonical, non-configurable. | `gofmt` / `prettier` |
| `vibe info` | Print resolved config, the model catalog default, the compilation's tools/agents, and toolchain versions. | `tsc --showConfig` |

### `vibe new`

```bash
vibe new support-bot
cd support-bot
vibe dev
```

Produces a runnable project:

```
support-bot/
  support.vibe          # a starter agent + tool
  vibe.config.ts        # or a config { } block in a .vibe
  tsconfig.json         # the TS program the compiler type-checks against
  package.json          # @vibe/* runtime deps, scripts
  .gitignore            # ignores .vibe/ and dist/
```

### `vibe dev`

The inner loop. Compiles into `.vibe/`, keeps the compiler and TS program warm, and
recompiles only what changed (the file plus anything that `use`s or imports it — see
[incremental & watch](./02-compiler.md#incremental--watch)), then hot-reloads the
running system where it is safe to do so.

```bash
vibe dev
# ✔ compiled support.vibe → .vibe/support.vibe.ts (7ms)
# ▶ running agent Support  (model claude-opus-4-8)
# … edit support.vibe …
# ✔ recompiled support.vibe (3ms) · hot-reloaded
```

### `vibe build`

The release path. Runs the compiler across the whole project, then hands the emitted
TypeScript to `tsc`/esbuild to produce `dist/`:

```bash
vibe build
# .vibe → .ts (@vibe/compiler) → .js (tsc/esbuild) → dist/
```

Layout is exactly as in the [compiler output section](./02-compiler.md#output-layout):
generated TS lands in `.vibe/` (gitignored), final JavaScript in `dist/`.

### `vibe check`

Type checking and semantic checking with **no emit**, and a non-zero exit on the
first error — the command your CI gate runs. It reports both diagnostic families the
compiler produces: Vibe-specific `VBxxxx` codes and re-anchored `TSxxxx` codes from
embedded TypeScript (see [Diagnostics](./02-compiler.md#diagnostics)).

```bash
vibe check
# support.vibe:14:9  error  VB2001  Unknown model id 'claude-opus-4.8'.
#                                   Did you mean 'claude-opus-4-8'?
# support.vibe:22:7  warning VB3010 Tool 'RefundOrder' is declared but never used
#                                   by any agent.
# orders.vibe:8:12   error  TS2345  Argument of type 'number' is not assignable
#                                   to parameter of type 'string'.
# ✖ 2 errors, 1 warning
$ echo $?
1
```

### `vibe fmt`

Formats `.vibe` source to one canonical shape — see [`vibe_fmt`](#vibe_fmt--the-formatter)
below. `--check` formats nothing and exits non-zero if anything is unformatted, for
CI.

```bash
vibe fmt            # rewrite files
vibe fmt --check    # verify only (CI)
```

### `vibe info`

```bash
vibe info
# project     support-bot
# config      vibe.config.ts
# default     model claude-opus-4-8
# agents      Support (entry), Triage
# tools       GetOrder, RefundOrder
# compiler    @vibe/compiler 0.x  ·  language-server 0.x
```

---

## `vibe_lsp` — the language server

The LSP server, a **Rust binary** built on [`tower-lsp`](https://github.com/ebkalderon/tower-lsp)
(the `vibe_lsp` crate). It is the **same compiler**, driven by editor events instead
of CLI invocations — it reuses the compiler's `vibe_binder` and `vibe_checker` crates,
the same [Bind and Check phases](./02-compiler.md#3-bind) that back `vibe check`. That
shared engine is the whole point: the squiggle in your editor and the failure in CI
come from one implementation, so they cannot drift. Vibe diagnostics answer instantly
from the in-memory Rust program; embedded-TypeScript diagnostics are merged in from a
background `tsserver` (see [type checking](./05-rust-implementation.md#type-checking-a-rust-front-end-a-typescript-back-end)).

It ships as a prebuilt binary (the `@vibe/language-server` npm package is a thin
launcher). It speaks the Language Server Protocol, so any LSP-capable editor gets the
full feature set from one server.

### Diagnostics

The same `VBxxxx` (Vibe-aware) and re-anchored `TSxxxx` (embedded TypeScript)
diagnostics that `vibe check` prints, streamed live as you type. `use Escalation`
with no such symbol in scope underlines in the editor with `VB2100` exactly as it
fails on the command line.

### Completion

Domain-aware, because the language knows what agents, tools, and models are:

- **Model ids** — completed from the [model catalog](../specs/model-spec.md) after
  `model` (`claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5`, …), so you
  never guess an id or typo one into a `VB2001`.
- **`use` targets** — every in-scope `tool`, `agent` (sub-agent), and `plugin`, from
  the [Bind](./02-compiler.md#3-bind) symbol table.
- **Agent fields** — `model`, `effort`, `system`, `memory`, `maxIterations`, `use`,
  with `effort` values (`low | medium | high | xhigh | max`) offered inline.

### Hover

- On a **`model`** id: the resolved catalog entry — default effort, capabilities,
  notes from the [model spec](../specs/model-spec.md).
- On a **`tool`**: its signature, its doc-comment description (what the model sees),
  and which agents `use` it.
- On an **`agent`**: its model, effort, and wired tools/sub-agents.

### Go-to-definition / find-references

Navigation follows the `use` edges the [binder](./02-compiler.md#3-bind) records.
Go-to-definition on `use GetOrder` jumps to the `tool GetOrder` declaration (across
files, and across the `.vibe`/`.ts` boundary via emitted `.d.ts`). Find-references on
a `tool` lists every agent that wires it.

### Rename

Rename a `tool`, `agent`, or `model` and every `use` and reference updates with it —
a symbol-table rename, not a text find-and-replace, so it respects scope and the
contextual-keyword rules from the [grammar](../specs/grammar.md#contextual-keywords).

**Why the editor and CLI never disagree:** completion, hover, navigation, and
diagnostics all read the binder's symbol table and the checker's results — the exact
artifacts `vibe check` produces. There is no second, "editor-only" analyzer to fall
out of sync. See [the compiler as the LSP engine](./02-compiler.md#incremental--watch).

---

## The editor extension

A thin client, like TypeScript's:

- **VS Code first.** A **TextMate grammar** provides syntax highlighting for Vibe
  constructs (`agent`, `tool`, `model`, `use`, triple-quoted prompts, `${}`
  interpolation) while embedded TypeScript spans highlight as TypeScript. Alongside
  it, an **LSP client** connects to the `vibe_lsp` server for everything semantic —
  diagnostics, completion, hover, navigation, rename.
- **JetBrains / Neovim (and any LSP editor)** connect to the same `vibe_lsp` binary
  through their generic LSP support. They get the identical semantic features; only
  the highlighting grammar is editor-specific.

The extension carries no language logic of its own. Highlighting is declarative
(TextMate); everything else is the compiler over LSP.

**Editor setup for contributors.** Working *on* the Rust toolchain wants
**`rust-analyzer`** in your editor (add it to the workspace recommendations
alongside the Vibe extension) — it powers completion and diagnostics over the
`crates/` Cargo workspace the same way `vibe_lsp` does over `.vibe` files.

---

## `vibe_fmt` — the formatter

Canonical formatting for `.vibe`, in the tradition of `gofmt` and Prettier: **one
right way, no options to argue over.** It is the Rust `vibe_fmt` crate: it parses with
the compiler's parser (so it understands Vibe declarations and where TypeScript spans
begin and end) and reprints from the AST, delegating the formatting of embedded TS
spans to the project's TypeScript formatting so bodies match your `.ts` style.

- Normalizes declaration spacing, field alignment, `use` ordering, and prompt
  indentation to a fixed style.
- Is idempotent — running it twice changes nothing.
- Powers `vibe fmt` (and `vibe fmt --check`), and can be invoked as format-on-save by
  the editor extension through the LSP formatting request.

Because format is canonical, it ends diffs-about-whitespace on `.vibe` the same way
`gofmt` did for Go.

---

## How this maps to the existing tooling

Vibe's toolchain does not replace the repo's TypeScript tooling — it **precedes**
it, exactly as the [compiler precedes `tsc`](./02-compiler.md#relationship-to-tsc).

| Existing tool | Role | Where Vibe fits |
|---|---|---|
| **tsup / esbuild / tsc** | Bundle & emit JS from `.ts` | The compiler runs *first*, emitting `.ts` into `.vibe/`; tsup/tsc then build that (plus your hand-written `.ts`) into `dist/`. `vibe build` orchestrates both. |
| **Vitest** | Test runner | Tests import agents/tools from `.vibe` via the emitted `.vibe.d.ts` and run against the runtime — see [TypeScript interop](./04-typescript-interop.md). |
| **Biome** | Lint & format `.ts`/`.json` | Biome owns `.ts`; `@vibe/fmt` owns `.vibe`. No overlap — the boundary is the file extension. |
| **Turborepo** | Task graph & caching | The `.vibe → .ts` compile is a task **upstream** of the `tsc`/`tsup` build task; Turbo caches it on `.vibe` inputs, so unchanged `.vibe` files skip recompilation. |

Concretely, the build graph gains one edge at the front:

```
vibe compile (.vibe → .ts in .vibe/)   →   tsc / tsup (.ts → .js in dist/)   →   test / bundle
```

And the CI gate gains one command in front of the TypeScript one:

```bash
vibe check          # VBxxxx + re-anchored TSxxxx, non-zero on error
vibe fmt --check    # canonical .vibe formatting
biome check         # your .ts / .json
vitest run          # tests against the runtime
```

`vibe check` slots in as the semantic gate for agents, tools, and models —
catching a dead tool or an unknown model id in CI, not at runtime — while `tsc`
(invoked through the compiler's [Check phase](./02-compiler.md#4-check)) remains the
single source of truth for type errors.

## Where to go next

- [The compiler](./02-compiler.md) — the engine all of this runs on.
- [Rust implementation](./05-rust-implementation.md) — the `crates/` workspace, the
  binder/checker crates the LSP reuses, and how the binaries are distributed.
- [Language implementation plan](../plan/05-language-implementation-plan.md) — the
  phased R0–R11 build-out of the Rust toolchain.
- [TypeScript interop](./04-typescript-interop.md) — how `.vibe` and `.ts` mix in the
  build, tests, and editor.
- [Syntax](./01-syntax.md) — the constructs the toolchain highlights and checks.
- [Grammar](../specs/grammar.md) — the formal grammar the parser and formatter share.
