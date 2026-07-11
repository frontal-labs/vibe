# vibe_binder

Symbol table construction and name resolution for the `.vibe` language.

## Overview

`vibe_binder` walks the AST produced by `vibe_parser` and builds a symbol table, resolving identifiers to their declarations. It is the bridge between parsing and semantic analysis.

## Dependencies

- [`vibe_ast`](../vibe_ast) — AST nodes to resolve.
- [`vibe_span`](../vibe_span) — source positions for declarations and references.

## Usage

`vibe_binder` is consumed by `vibe_checker` and `vibe_lsp` to provide name-resolution information.
