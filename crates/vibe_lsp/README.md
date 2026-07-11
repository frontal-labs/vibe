# vibe_lsp

The Vibe language server.

## Overview

`vibe_lsp` implements the Language Server Protocol (LSP) for `.vibe` files. It provides IDE features such as diagnostics, go-to-definition, hover information, and formatting by orchestrating the compiler pipeline and the formatter.

## Dependencies

- [`vibe_compiler`](../vibe_compiler) — full compilation for diagnostics.
- [`vibe_parser`](../vibe_parser) — lightweight parsing for syntax trees.
- [`vibe_binder`](../vibe_binder) — name resolution for go-to-definition.
- [`vibe_checker`](../vibe_checker) — semantic diagnostics.
- [`vibe_fmt`](../vibe_fmt) — document formatting on save.
- [`vibe_span`](../vibe_span) — source positions for LSP ranges.
- [`tower-lsp`](https://crates.io/crates/tower-lsp) — LSP server framework.
- [`tokio`](https://crates.io/crates/tokio) — async runtime.

## Installation

```bash
cargo build --bin vibe-lsp
```

## Usage

Run `vibe-lsp` and point your editor's LSP client at it. The server communicates over stdin/stdout using the standard LSP JSON-RPC protocol.
