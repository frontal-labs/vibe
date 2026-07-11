# Language Implementation Plan (Rust)

The comprehensive, code-level plan to implement the Vibe **language** — from the
empty `crates/` ghost directory to a shipping compiler, language server, and editor
extension. The language front end is Rust; it emits TypeScript that runs on the
`@vibe/*` runtime (the [agentic implementation plan](./02-agentic-implementation-plan.md)
builds that runtime). Read alongside
[The compiler is written in Rust](../language/05-rust-implementation.md),
[The compiler](../language/02-compiler.md), [Syntax](../language/01-syntax.md), and
[Grammar](../specs/grammar.md).

## Two workstreams, one product

```
  RUNTIME (TypeScript)                 LANGUAGE (Rust)
  packages/*  — the compile target     crates/*  — the compiler/LSP/CLI
  Phases 0–7  (build-plan.md)          Phases R0–R11  (this doc)
        ▲                                     │
        └──────── emitted .ts imports ────────┘
```

The language emits calls onto the runtime, so the **emitter (R4) needs the runtime's
public API to target**. It can develop against the runtime's *types* and the
deterministic **fake provider** (runtime Phase 1) long before a live model exists —
but `vibe dev` running a real agent depends on runtime Phase 5. Sequence the two
tracks so the emitter's target is stable before R4 hardens.

## Ground rules

- **One responsibility per crate**; acyclic graph (see
  [Rust implementation → crate graph](../language/05-rust-implementation.md#crate-dependency-graph)).
- **`#![forbid(unsafe_code)]`** everywhere except `vibe_napi`/`vibe_wasm` (FFI).
- **Snapshot-test everything** with `insta` — tokens, AST, diagnostics, emitted TS.
- **Diagnostics are first-class** — every error has a `VBxxxx` code, a span, and a
  message with a suggestion where possible.
- **The emitter targets hand-writable code** — emitted `.ts` must look like what a
  careful human would write against `@vibe/*`, because that is the contract.

---

## Phase R0 — Workspace bootstrap ✅ DONE

Turned the ghost directories into a real Cargo workspace and fixed the audit items
that touch the toolchain. Verified locally: `cargo build`, `cargo fmt --check`,
`cargo clippy --all-targets -D warnings`, and `cargo test` (13 unit tests) all green.

- [x] Root `Cargo.toml` with `[workspace] members = ["crates/*"]`, `[workspace.package]`
      shared metadata, and a release profile (`lto = "thin"`, `codegen-units = 1`, `strip`).
- [x] `rust-toolchain.toml` pinning `1.95.0` + `rustfmt`, `clippy`, `rust-analyzer`.
- [x] `.cargo/config.toml` (with a `cargo xtask` alias for the CLI).
- [x] Crate skeletons for all **14 crates**, each with a `//!` doc, real path-dependency
      edges (the documented graph), `#![forbid(unsafe_code)]` outside the FFI crates
      (`vibe_napi`/`vibe_wasm`), and a **passing** unit test. (The plan originally said
      "failing `todo!()`"; passing stubs are used so the exit gate — `cargo test` green —
      holds.)
- [x] Renamed `bechmarks/` → `benchmarks/` (with a README); removed the stray top-level
      `errors/` ghost dir. `examples/`/`scripts/`/`tests/` left as workspace dirs.
- [x] CI: a `rust` job (`cargo fmt --check`, `cargo clippy --all-targets -D warnings`,
      `cargo test`) added to `ci.yml` beside `bun ci:check`. Fixed the `main`→`master`
      trigger in `ci.yml`, `release.yml`, `.changeset/config.json`, and `biome-config`.
- [x] Added `rust-analyzer` (+ `even-better-toml`) to `.vscode/extensions.json`.

**Exit gate (met):** `cargo build` and `cargo test` green; `cargo clippy -D warnings`
clean; the workspace compiles with all 14 crates present. **Next: [Phase R1](#phase-r1--foundations-spans-diagnostics-lexer).**

---

## Phase R1 — Foundations: spans, diagnostics, lexer

**Status: ✅ done.** Verified green: `cargo test` (33 workspace tests, incl. 18 in
`vibe_lexer` + 2 `insta` snapshots), `cargo fmt --check`, `cargo clippy -D warnings`.

- [x] **`vibe_span`** — `Span { lo, hi }` (+ `at`/`to`), `Spanned<T>`, `SourceId`,
      `Location`, and `SourceFile` with a precomputed line index and UTF-8-correct
      `location(offset)`/`slice(span)`. Zero deps.
- [x] **`vibe_diagnostics`** — `Diagnostic { code, severity, span, message, help }`
      with `error`/`warning`/`with_help` builders, and the `VB1xxx` lexer code band
      (`UNTERMINATED_STRING` = VB1001, …). (`miette`/`ariadne` rendering deferred to
      when diagnostics are surfaced by the CLI — R5.)
- [x] **`vibe_lexer`** — cursor-based `Lexer` + `tokenize()`: all keywords,
      punctuation, `->`, **hyphenated model ids** as one `Ident` (`claude-opus-4-8`),
      numbers with `_`, `"..."` and `"""..."""` strings (with `${}`-aware scanning),
      `///` doc comments (line/block comments skipped), and lexer diagnostics.
      Embedded TypeScript is captured as **opaque byte spans** via
      `capture_balanced` (tool bodies, brace/string-aware) and `capture_ts_type`
      (param/return types, generic-aware) — the lexer never tokenizes TS. Keywords
      are contextual, so a captured span containing `agent` is untouched.

**Tests:** exact-token assertions, TS-span capture (nesting + strings), diagnostic
codes, and `insta` snapshots of the token stream. (Fuzzing deferred to R11's
harness.)
**Exit gate (met):** the documented examples lex to stable snapshots; TS spans are
captured with correct byte ranges. **Next: [Phase R2](#phase-r2--parser--ast).**

---

## Phase R2 — Parser & AST

**Status: ✅ done.** Verified green: `cargo test` (45 workspace tests, incl. 12 in
`vibe_parser` + 1 `insta` AST snapshot), `cargo fmt --check`, `cargo clippy -D warnings`.

- [x] **`vibe_ast`** — real node types: `File`, `Decl` (7 variants), `ImportDecl`,
      `ConfigDecl`, `ModelDecl`, `MemoryDecl`, `ToolDecl` (params, return, body span,
      doc, `exported`), `AgentDecl` (members incl. `Model`/`Use`/`Field`/`Error`),
      `PluginDecl`, `Param`, `Field`, `Value` (`Word`/`Str`/`Number`/`Block`),
      `Ident`, `TsSpan`. Every node carries a `Span`.
- [x] **`vibe_parser`** — a recursive-descent `Parser` that **drives the lexer
      directly** (rather than a flat token stream) so it can rewind to a token start
      and call `capture_balanced`/`capture_ts_type` for embedded-TS spans (tool
      bodies, param/return types, `@desc` strings, nested `config` blocks). Parses
      all seven declarations. **Error recovery** with guaranteed forward progress
      (`parse_file` bumps if a decl stalls; params recover to `,`/`)`), emitting
      `VB20xx` diagnostics merged with lexer diagnostics in source order.

**Tests:** exact AST assertions (names, param types, body/return spans sliced from
source), embedded-TS capture with nesting + strings, `@desc`, doc/`export`,
error-recovery, and an `insta` AST snapshot of a full file. (A larger broken-input
ui-test corpus is deferred to R11.)
**Exit gate (met):** the documented examples parse to a stable AST snapshot with
correct spans; malformed inputs recover and report precise `VBxxxx` errors.
**Next: [Phase R3](#phase-r3--binder--checker-vibe-semantics).**

---

## Phase R3 — Binder & checker (Vibe semantics)

**Status: ✅ done.** Verified green: `cargo test` (57 workspace tests, incl. 13 new
binder/checker tests + a diagnostics snapshot), `cargo fmt --check`,
`cargo clippy -D warnings`.

- [x] **`vibe_binder`** — `SymbolTable` over the AST: every named decl (tool/agent/
      model/memory/plugin) with kind, name span, and `exported`; `lookup`,
      `names_of(kind)`, and `duplicates()`. `use`-edge resolution is done by the
      checker against this table.
- [x] **`vibe_checker`** — the semantic rules a library can't express:
  - `use X` resolves to an in-scope tool/sub-agent/plugin, else `VB2100`
    (with "did you mean"); `use` of a memory/model is rejected.
  - `model <id>` (agent field **and** `model { id ... }`) is in the
    [catalog](../specs/model-spec.md) or a named `model`; unknown → `VB2001` with a
    Levenshtein "did you mean".
  - Dead tool (non-`export`, never `use`d) → `VB3010` warning.
  - More than one `config` → `VB2200`; duplicate decl name → `VB2102`.
  - Agent `use` cycles (incl. self-use) → `VB2101`, via DFS back-edge detection.
  - Tool param/return function types (`=>`) → `VB2300` (conservative R3 rule;
    fuller JSON-Schema lowerability lands with the emitter, R4).

**Tests:** one focused test per rule (valid file → 0 diags, unknown model +
suggestion, named-model resolution, unresolved use + suggestion, dead vs exported
tool, multiple config, duplicate, agent/self cycles, function-type param) plus an
`insta` snapshot of rendered diagnostics for a messy file.
**Exit gate (met):** all the semantic diagnostics from the
[compiler doc](../language/02-compiler.md#diagnostics) fire with correct spans and
codes; the compiler façade wires `bind → check` end-to-end.
**Next: [Phase R4](#phase-r4--emitter--source-maps).**

---

## Phase R4 — Emitter & source maps

**Status: ✅ done.** Verified green: `cargo test` (75 workspace tests, incl. 20 new
`vibe_emit` tests + a golden TypeScript snapshot), `cargo fmt --check`,
`cargo clippy -D warnings`. This is the payoff — `.vibe` now compiles to runnable TS.

- [x] **`vibe_emit`** — lower the AST to TypeScript targeting the `@vibe/*` runtime:
  - `tool` → `defineTool({ name, description, schema, execute })` — body & return
    type copied verbatim, params destructured, doc comment → `description`.
  - `agent` → `createAgent({ model, system, tools })`; `use` → `tools: [...]`;
    catalog model id → string, named `model` → identifier ref; prompt → **template
    literal** (so `${}` interpolation survives).
  - `config` → `defineConfig({...})`, `model` → object, `import` copied verbatim;
    `memory`/`plugin` emit a placeholder (full emit later).
  - **Type → Zod lowering** (`lower.rs`): `string`/`number`/`boolean`, `T[]` /
    `Array<T>`, object literals with optional (`k?` → `.optional()`), string-literal
    unions → `z.enum`, `@desc` → `.describe`, else `z.unknown()`.
  - Emits **`.ts` + `.d.ts` + a valid v3 source map** (`sourcemap.rs`: real Base64
    VLQ, line-granular) with header import management (only what's used).

**Tests:** a golden `insta` snapshot of the generated TS for the canonical file;
per-construct structural assertions (defineTool/createAgent/defineConfig, schema,
describe, return annotation, template prompt, model ref, `.d.ts`); unit tests for
the type→Zod lowering and VLQ encoding; source-map v3 validity.
**Exit gate (met):** the worked example emits well-formed TS that calls the runtime;
the source map is a valid v3 document embedding the `.vibe` source. (Running `tsc
--noEmit` on the output against real runtime types is deferred to **R6**, which
wires `tsc` in — the two-pass design; there is no Node/`tsc` in the Rust test env.)
**Next: [Phase R5](#phase-r5--compiler-library--vibe-buildvibe-check-cli).**

---

## Phase R5 — Compiler library + `vibe build`/`vibe check` CLI

**Status: ✅ done.** Verified green: `cargo test` (82 workspace tests, incl. 5 new
`assert_cmd` CLI integration tests + 3 compiler-API tests), `cargo fmt --check`,
`cargo clippy -D warnings`. Demonstrated end-to-end: `vibe new` → `vibe check`
(clean) → `vibe build` → real TypeScript with a `sourceMappingURL`.

- [x] **`vibe_compiler`** — the façade library: `compile(src) -> Compilation`
      (outputs + sorted diagnostics), `Compilation::{has_errors, error_count,
      warning_count}`, and `render_diagnostics(name, src, &diags)` anchoring each to
      `name:line:col` with a `help:` line. Re-exports `Emit`/`Diagnostic`/`Severity`
      so downstream crates depend on one thing. (Incremental/dependency-aware state
      lands with `vibe dev` in R7.)
- [x] **`vibe_cli`** — the `vibe` binary (`clap` derive): `vibe check` (renders
      diagnostics, non-zero exit on error — the CI command), `vibe build` (writes
      `.vibe/<stem>.vibe.ts` + `.d.ts` + `.ts.map`, appends `//# sourceMappingURL`),
      `vibe new <name>` (scaffolds a checkable project), `vibe info`.

**Tests:** 5 `assert_cmd` integration tests (`--version`; check passes on a valid
project and fails with `VB2100` on a bad one; build writes the `.ts`/`.d.ts`/`.map`;
`new` scaffolds a project that then passes `check`).
**Exit gate (met):** `vibe build` turns a `.vibe` project into `.ts` (+ `.d.ts` +
source map); `vibe check` reports diagnostics and exits non-zero on error; both
covered by `assert_cmd`. (Invoking `tsc`/esbuild to produce `dist/*.js` is wired in
R6/R7 — the Node integration.)
**Next: [Phase R6](#phase-r6--embedded-typescript-type-check-integration).**

---

## Phase R6 — Embedded-TypeScript type-check integration

**Status: ✅ done.** Verified green: `cargo test` (85 workspace tests, incl. 2
`tscheck` unit tests + a **live** `tsc` integration test), `cargo fmt --check`,
`cargo clippy -D warnings`. Demonstrated live with `tsc` 5.9.3.

The [two-pass design](../language/05-rust-implementation.md#type-checking-a-rust-front-end-a-typescript-back-end):
Rust checks Vibe semantics; TypeScript checks embedded code.

- [x] **Dense source maps** — the emitter now records a source mark per tool-body
      line (`Emit::line_map`) and emits bodies on their own lines, so a `tsc` error
      inside a body re-anchors to the exact `.vibe` line.
- [x] **`vibe_compiler::tscheck`** (pure, unit-tested) — `parse_tsc_output` parses
      `file(line,col): error TSxxxx: msg`; `reanchor` maps each generated line →
      `.vibe` offset via `line_map` and builds a `Diagnostic` carrying the `TSxxxx`
      code (new `Diagnostic::external_code` / `display_code()`).
- [x] **`vibe check --ts`** — writes the emitted `.ts` + ambient runtime stubs +
      a tsconfig (`noImplicitAny` off to silence synthetic-param noise) to a temp
      dir, runs `tsc` (found via `$VIBE_TSC` or `node_modules/.bin/tsc`), and merges
      the re-anchored `TSxxxx` diagnostics with the `VBxxxx` ones, sorted by
      position. Skips gracefully when `tsc` is absent.

**Tests:** `tscheck` parse + re-anchor unit tests; a gated `assert_cmd` test proving
a body's `const s: string = 123` surfaces as `TS2322` at `bad.vibe:2` (self-skips
when Node/`tsc` isn't installed, so the Rust CI track never blocks on it).
**Exit gate (met):** a type error inside a `tool` body is reported at the correct
`.vibe:line` with its `TSxxxx` code — verified live.
**Next: [Phase R7](#phase-r7--vibe-dev-watch-incremental-run).**

---

## Phase R7 — `vibe dev`: watch, incremental, run

**Status: ✅ done (watch/recompile); ⏸ run gated on the runtime.** Verified green:
`cargo test` (86 tests, incl. a `dev --no-watch` integration test) + a **live watch
smoke**: edit → recompile in **31ms** with fresh diagnostics.

- [x] **`vibe dev`** with file-watch (`notify`, recursive on the project dir) and a
      150ms debounce; recompiles + re-emits on every `.vibe` change and prints
      timing (`recompiled N file(s) in Xms — E error(s)`). Ignores its own `.vibe/`
      output writes (filters to `.vibe` extension) so there's no feedback loop.
- [x] **`vibe dev --no-watch`** — a single compile pass (CI-friendly, tested).
- [x] Refactored `build`/`dev` onto a shared `compile_project()`.
- [ ] **Running the emitted program** — spawning Node on the output requires the
      `@vibe/*` **runtime** (the TypeScript `packages/` workstream, still stubbed).
      `vibe dev` says so explicitly. This unblocks once runtime Phases 1–5 land.
- [ ] Incremental *dependency-graph* recompile (only affected files) and a warm
      `tsc` — deferred; current recompile is whole-project but already sub-100ms.

**Exit gate (met for compile/watch):** editing a `.vibe` file recompiles in well
under a second (31ms measured). The end-to-end *run* awaits the runtime.
**Next: [Phase R8](#phase-r8--node--wasm-bindings--npm-distribution).**

---

## Phase R8 — Node & WASM bindings + npm distribution

**Status: ✅ napi verified live; wasm + packaging scaffolded (build/publish need the
FFI/release toolchain).** Verified green: `cargo test` (88 tests) + a **live Node
test** loading the `.node` addon and calling `compile`/`check`/`version`.

- [x] **`vibe_napi`** (`napi-rs`) — `#[napi] compile`/`check`/`version` over
      `vibe_compiler::{compile_json, check_json}` (structured JSON with located
      diagnostics). The FFI is behind a `node` feature so the default workspace
      build/test doesn't link N-API. **Built and loaded in Node 22 live:**
      `vibe.check("agent A { use Ghost }")` → `VB2100` at line 1 col 15;
      `vibe.compile(...)` → real TypeScript.
- [x] **`vibe_wasm`** (`wasm-bindgen`) — `compile`/`check`/`version` behind a `wasm`
      feature; the crate builds in-workspace. The `wasm32` build + `wasm-bindgen`
      step is documented but not run here (no wasm target/tooling in this env).
- [x] **npm distribution templates** under `npm/` (outside the bun workspace):
      the `vibe` CLI launcher (resolves `@vibe/cli-<platform>-<arch>` and execs it —
      verified it errors cleanly when the platform pkg is absent, the
      `@biomejs/biome` model), `@vibe/compiler` (loads the napi addon), and
      `@vibe/plugin-build` (an esbuild/Vite/tsup plugin compiling `.vibe`).
- [ ] Cross-compiled per-platform packages + actual npm publish — the release
      pipeline, **Phase R11**.

**Exit gate (met where verifiable):** the napi addon works in Node in-process; the
launcher and `@vibe/compiler` wrappers are in place. `npx vibe` on end users'
machines and the in-browser playground need the R11 release artifacts (prebuilt
per-platform binaries / the wasm bundle).
**Next: [Phase R9](#phase-r9--language-server--editor-extension).**

---

## Phase R9 — Language server + editor extension

**Status: ✅ done — verified live over JSON-RPC.** Green: `cargo test` (95 tests,
incl. 7 pure feature tests) + a **live LSP round-trip** against the `vibe-lsp`
binary (initialize → didOpen → completion → definition).

- [x] **`vibe_lsp`** (`tower-lsp` + `tokio`). The protocol handlers are thin
      adapters over pure, unit-tested `features` fns (the same compiler front end as
      the CLI, so editor and `vibe check` never disagree):
      diagnostics (published on open/change), **context-aware completion** (catalog
      model ids after `model`, in-scope tool/agent/plugin names after `use`, else
      keywords), **hover** (on a declared symbol), and **go-to-definition** (jump to
      a `use` target's declaration). Verified live: `use ` → `GetOrder`; `model` →
      `claude-opus-4-8`; goto → the tool's name span. (Find-references, rename, and
      merging the R6 `tsserver` diagnostics are deferred extensions.)
- [x] **VS Code extension** (`editors/vscode/`) — a TextMate grammar for `.vibe`
      highlighting (valid JSON, keywords/strings/comments/model-ids/types), language
      configuration, and an LSP client that launches the `vibe-lsp` binary.
      JetBrains/Neovim work via the same server over generic LSP.

**Exit gate (met):** live diagnostics, completion of a model id **and** a `use`
target, and go-to-`tool` all verified via a JSON-RPC round-trip; the CLI and editor
share `vibe_compiler`, so diagnostics never disagree. (The VS Code UI itself needs
an editor to see; the server backing it is proven.)
**Next: [Phase R10](#phase-r10--formatter--scaffolder-polish).**

---

## Phase R10 — Formatter + scaffolder polish

**Status: ✅ done.** Verified green: `cargo test` (104 tests, incl. 8 formatter +
2 new CLI tests) + a live `vibe fmt` demo.

- [x] **`vibe_fmt`** — a canonical AST pretty-printer: one declaration per block,
      2-space indent, one member/field per line, `, `-separated params, blank line
      between decls. Tool/plugin bodies and type annotations are kept **verbatim**
      (they're TypeScript); doc comments preserved. **Idempotent** (tested on a
      corpus) and **safe** — invalid source is returned unchanged. (Known gap:
      free-standing non-doc comments aren't re-attached yet.)
- [x] **`vibe fmt [path] [--check]`** — formats in place or reports unformatted
      files with a non-zero exit (CI-friendly). Format-on-save is wired via the LSP
      (`textDocument/formatting` → a whole-document edit).
- [x] **`vibe new --template minimal|tool|multi`** — three templates
      (bare agent / tool-using / multi-agent with delegation), each scaffolds a
      project that `vibe check` passes.

**Tests:** normalization, idempotency-on-a-corpus, doc-comment/export preservation,
multiline-body-verbatim, and invalid-input-unchanged; CLI `fmt --check`→write→clean
and the `multi` template passing `check`.
**Exit gate (met):** `vibe fmt` is idempotent on a corpus; all three `vibe new`
templates scaffold projects that pass `vibe check`.
**Next: [Phase R11](#phase-r11--release-engineering).**

---

## Phase R11 — Release engineering

**Status: ✅ authored & verified where runnable; matrix/publish need CI + secrets.**
Green: `cargo test` (104) + `cargo bench` runs locally; the release workflow is
valid YAML and the installer passes `sh -n`.

- [x] **Benchmarks + perf gate** — `benchmarks/` is a real `criterion` crate
      (`vibe_benchmarks`, a workspace member) benchmarking `compile`/`compile_json`
      (~33 µs for a multi-agent file locally). CI compiles them (`cargo bench
      --no-run`); the release baseline comparison (`--save-baseline`/`critcmp`) is
      the regression gate.
- [x] **Release CI** (`.github/workflows/release-binaries.yml`, valid YAML) — on a
      `v*` tag, a cross-compile matrix (macOS arm64/x64, Linux x64/arm64, Windows
      x64) builds the `vibe` CLI, a napi matrix builds the `.node` addon, a wasm job
      builds the browser module, and everything is attached to the GitHub release.
- [x] **Install paths** — `scripts/install.sh` (`curl | sh`; detects platform, pulls
      the release tarball, installs to `~/.local/bin`) plus the `cargo install --git`
      fallback; the npm launcher/`@vibe/compiler` wrappers from R8 consume the
      published artifacts. CI now also smoke-builds the napi addon.
- [ ] **Actually running the matrix + signing + npm/Homebrew publish** — requires
      GitHub Actions runners, signing keys, and an npm token; not executable in this
      environment. The pipeline is authored and ready to run on a tag.

**Exit gate (met where verifiable):** benchmarks run and gate; the release workflow
and installer are authored and structurally valid. The end-user `npx vibe` /
`cargo install` / `curl | sh` paths light up once the pipeline runs against a real
tagged release with credentials.

---

## Sequencing

```
R0 ─▶ R1 ─▶ R2 ─▶ R3 ─▶ R4 ─▶ R5 ─▶ R6 ─▶ R7 ─▶ R8 ─▶ R9 ─▶ R10 ─▶ R11
                            │                         │
                 (needs runtime public API      (LSP reuses R3
                  + fake provider to target)      binder/checker)
```

R1–R5 are the critical path to "a `.vibe` file compiles." R6/R9 add the TypeScript
and editor experience. R8/R11 make it installable. The emitter (R4) is the coupling
point to the runtime — keep the runtime's public API (from
[the agentic implementation plan](./02-agentic-implementation-plan.md)) stable before
R4 hardens.

## Definition of done for the language

- `vibe new` → `vibe dev` runs a tool-using agent from a `.vibe` file.
- `vibe check` reports both Vibe (`VBxxxx`) and TypeScript (`TSxxxx`) diagnostics at
  `.vibe` positions and gates CI.
- The VS Code extension gives highlighting, diagnostics, completion, and navigation.
- Prebuilt binaries install via npm, `cargo`, and Homebrew.
- Emitted TypeScript is readable and imports only the documented `@vibe/*` runtime.
