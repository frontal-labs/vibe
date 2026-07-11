# The Vibe Compiler is Written in Rust

> 🚧 Planned. The `.vibe` language front end — lexer, parser, binder, checker,
> emitter, formatter, CLI, and language server — is implemented in **Rust**, living
> in the `crates/` Cargo workspace. The TypeScript `@vibe/*` packages remain the
> **runtime** the compiler emits calls onto. This mirrors the modern toolchain
> playbook: SWC, Biome, oxc, Turbopack, and Ruff all put the hot compiler path in
> Rust and expose it to the JavaScript ecosystem through native bindings.

## Why Rust

A compiler and a language server are latency-critical: they run on every keystroke
(LSP) and every build. The requirements — fast startup, no GC pauses, a single
static binary, a WASM target for the browser playground, and zero-copy interop with
Node — are exactly what pushed the JS-tooling ecosystem to Rust.

| Concern | Why Rust wins |
|---|---|
| Throughput | Hand-written lexer/parser with no allocator churn; SWC/oxc-class speed. |
| Editor latency | The LSP answers from an in-memory Rust program; no Node cold-start per request. |
| Distribution | One statically-linked binary per platform (`vibe`), plus `.node` addons and a `.wasm` module — no runtime toolchain to install. |
| Safety | No segfaults or data races in the compiler; `#![forbid(unsafe_code)]` outside the FFI crates. |
| Reuse | The same core crates power the CLI, the LSP, the WASM playground, and the Node binding — one implementation, many front ends. |

## The `crates/` workspace

The Rust code lives under `crates/` (today an empty ghost directory — see the
[current-state audit](../analysis/03-current-state-audit.md)). The intended layout,
one responsibility per crate:

```
crates/
  vibe_span/          source files, byte spans, positions            (no deps)
  vibe_diagnostics/   Diagnostic, VBxxxx codes, miette-style render
  vibe_lexer/         .vibe tokenizer; captures embedded TS as opaque spans
  vibe_ast/           AST node types (Decl, ToolDecl, AgentDecl, …)
  vibe_parser/        recursive-descent parser → AST, with error recovery
  vibe_binder/        symbol table, `use` resolution, scopes
  vibe_checker/       Vibe semantic analysis (model catalog, dead tools, cycles…)
  vibe_emit/          codegen: AST → TypeScript + source map; type→schema lowering
  vibe_fmt/           canonical .vibe formatter (the `vibe fmt` engine)
  vibe_compiler/      library crate wiring lex→parse→bind→check→emit; public API
  vibe_cli/           the `vibe` binary (new/dev/build/check/fmt) — clap
  vibe_lsp/           the language server binary — tower-lsp; reuses binder/checker
  vibe_napi/          napi-rs bindings → a Node .node addon (in-process compile)
  vibe_wasm/          wasm-bindgen bindings → browser playground
```

### Crate dependency graph

```
                 vibe_cli ─┐        vibe_lsp ─┐     vibe_napi / vibe_wasm
                           ▼                  ▼            ▼
                        vibe_compiler ◀───────┴────────────┘
        ┌──────────┬──────────┬──────────┬──────────┬──────────┐
        ▼          ▼          ▼          ▼          ▼          ▼
   vibe_lexer  vibe_parser vibe_binder vibe_checker vibe_emit vibe_fmt
        └──────────┴────── vibe_ast ────┴──────────┘
                           vibe_diagnostics
                              vibe_span
```

Acyclic, like the TypeScript runtime graph: `vibe_span` is the floor,
`vibe_compiler` is the composition root, and the four front ends (CLI, LSP, napi,
wasm) sit on top. See [Package topology](../architecture/02-package-topology.md) for
how the Rust workspace relates to the `packages/` npm workspace.

## Recommended dependencies

- **Lexer/parser:** hand-written (SWC/oxc style) for speed and error recovery.
  `logos` is a fine option for the lexer if hand-rolling proves unnecessary.
- **Diagnostics:** `miette` + `ariadne` for rich, source-anchored rendering.
- **CLI:** `clap` (derive). **LSP:** `tower-lsp` + `tokio`.
- **Node bindings:** `napi` / `napi-derive` (`napi-rs`). **WASM:** `wasm-bindgen`.
- **Snapshot tests:** `insta`. **Benchmarks:** `criterion` (in `benchmarks/` — fix
  the `bechmarks` typo first).
- **Serialization** (AST/source maps across FFI): `serde` + `serde_json`.

## Type checking: a Rust front end, a TypeScript back end

This is the one subtlety worth stating plainly. The Rust compiler **does not
type-check TypeScript** — it cannot host the TS type system in-process. Checking is
split:

1. **Vibe semantics (Rust, `vibe_checker`)** — everything the language itself
   knows: `use` resolves, model ids are in the [catalog](../specs/model-spec.md),
   no dead tools, no illegal `use` cycles, one `config`, parameter types are
   lowerable to a tool schema. Fast, on every keystroke.
2. **Embedded TypeScript (delegated to `tsc`)** — the code inside tool bodies,
   return types, prompt interpolations, and plugin bodies is checked by
   **TypeScript itself**, run over the emitted `.ts`. Diagnostics are re-anchored to
   `.vibe` positions via the source map the emitter produces.

```
.vibe ─▶ vibe_compiler (Rust) ─▶ .ts + .d.ts + sourcemap
                                   │
                                   ▼
                             tsc --noEmit  ─▶ TSxxxx diagnostics
                                   │            │ re-anchored via sourcemap
                                   ▼            ▼
                              emitted JS    reported at .vibe:line:col
```

The [compiler doc](./02-compiler.md#4-check) describes both passes. In the editor,
the [LSP](./03-toolchain.md) returns Vibe diagnostics instantly from Rust and merges
embedded-TypeScript diagnostics from a background `tsserver` — so the two type
systems stay reconciled without the Rust process ever embedding the TS checker. This
supersedes the earlier "in-process TS Compiler API" sketch: the front end is Rust,
so TS checking is a delegated back-end pass.

## Distribution to the JavaScript ecosystem

Vibe is a Rust toolchain that a JavaScript project consumes, exactly like Biome and
SWC:

- **The `vibe` CLI** ships as a prebuilt binary per platform. The `vibe` npm package
  is a thin JS launcher whose `optionalDependencies` are platform packages
  (`@vibe/cli-darwin-arm64`, `@vibe/cli-linux-x64-gnu`, `@vibe/cli-win32-x64`, …),
  each carrying the right binary — the `@biomejs/biome` model. Also installable via
  `cargo install`, Homebrew, and `curl | sh`.
- **In-process compilation for JS tooling** uses the `vibe_napi` `.node` addon,
  published as `@vibe/compiler-<platform>` packages, so a Vite/tsup plugin, test
  runner, or dev server can call `compile()`/`check()` without spawning a process.
- **The browser playground** uses `vibe_wasm` (`@vibe/wasm`) so `.vibe` compiles in
  the browser with no server.

The emitted `.ts`/`.js` imports the `@vibe/*` **runtime** npm packages — those are
ordinary TypeScript and unchanged. The Rust toolchain is **dev-time**; nothing Rust
ships inside the deployed agent.

## Toolchain & repo integration

- **`rust-toolchain.toml`** pins the Rust version (channel + components: `rustfmt`,
  `clippy`).
- **Root `Cargo.toml`** declares the workspace (`members = ["crates/*"]`) alongside
  the existing bun/Turborepo TypeScript workspace. The two coexist: `cargo` builds
  the toolchain, `bun`/`turbo` build the runtime and wrap the binaries.
- **`.cargo/config.toml`** holds build profiles and target config (today `.cargo/`
  is an empty ghost dir).
- **CI** gains a Rust job: `cargo fmt --check`, `cargo clippy -D warnings`,
  `cargo test` (with `insta`), plus a cross-compile matrix for release binaries. It
  runs beside the existing `bun ci:check`. See
  [Testing strategy](../plan/03-testing-strategy.md).
- **Editor:** add `rust-analyzer` to the workspace recommendations (currently absent
  — see the audit).

## Build the language, step by step

The full crate-by-crate, phase-by-phase sequence — from an empty `crates/` to a
shipping compiler, LSP, and editor extension — is in the
[Language implementation plan](../plan/05-language-implementation-plan.md).
