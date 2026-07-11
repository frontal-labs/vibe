# vibe_parser

The recursive-descent parser for the `.vibe` language.

## Overview

`vibe_parser` consumes tokens from `vibe_lexer` and constructs an AST defined in `vibe_ast`. It implements a recursive-descent parsing strategy, emitting diagnostics for syntax errors.

## Dependencies

- [`vibe_ast`](../vibe_ast) — AST node types to construct.
- [`vibe_lexer`](../vibe_lexer) — token stream input.
- [`vibe_diagnostics`](../vibe_diagnostics) — syntax error reporting.
- [`vibe_span`](../vibe_span) — source positions for parsed nodes.

## Development dependencies

- [`insta`](https://crates.io/crates/insta) — snapshot tests for parse trees.

## Usage

`vibe_parser` is the second phase of the compiler pipeline. Its output AST is consumed by `vibe_binder`, `vibe_checker`, `vibe_fmt`, and `vibe_emit`.
