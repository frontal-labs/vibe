# vibe_compiler

The compiler facade for the `.vibe` language.

## Overview

`vibe_compiler` exposes the complete compilation pipeline as a single, convenient API:

```
lex -> parse -> bind -> check -> emit
```

It composes the lower-level crates (`vibe_parser`, `vibe_binder`, `vibe_checker`, `vibe_emit`) so that consumers do not need to orchestrate them individually.

## Dependencies

- [`vibe_parser`](../vibe_parser) — parsing tokens into an AST.
- [`vibe_binder`](../vibe_binder) — building symbol tables.
- [`vibe_checker`](../vibe_checker) — semantic validation.
- [`vibe_emit`](../vibe_emit) — code generation to TypeScript.
- [`vibe_diagnostics`](../vibe_diagnostics) — error collection and reporting.
- [`vibe_span`](../vibe_span) — source position tracking.

## Usage

`vibe_compiler` is used by `vibe_cli`, `vibe_lsp`, `vibe_napi`, and `vibe_wasm` as the single entry point into the compiler.
