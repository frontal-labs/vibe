# vibe_checker

Semantic analysis for the `.vibe` language.

## Overview

`vibe_checker` performs type checking, borrow checking, and other semantic validations over the `.vibe` AST. It emits diagnostics using the `VBxxxx` error code scheme defined in `vibe_diagnostics`.

## Dependencies

- [`vibe_ast`](../vibe_ast) — the AST being checked.
- [`vibe_binder`](../vibe_binder) — symbol tables and resolved names.
- [`vibe_diagnostics`](../vibe_diagnostics) — structured error reporting.
- [`vibe_span`](../vibe_span) — source positions for error messages.

## Development dependencies

- [`vibe_parser`](../vibe_parser) — used in snapshot tests.
- [`insta`](https://crates.io/crates/insta) — snapshot testing.

## Usage

Run `cargo check -p vibe_checker` to verify the crate builds. Run `cargo test -p vibe_checker` to execute the semantic-check test suite.
