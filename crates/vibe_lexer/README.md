# vibe_lexer

The lexer for the `.vibe` language.

## Overview

`vibe_lexer` tokenizes `.vibe` source files into a stream of tokens. It also handles embedded TypeScript regions, capturing them as opaque spans so that the parser and downstream phases can treat them as single units.

## Dependencies

- [`vibe_span`](../vibe_span) — tracking file positions and byte offsets for each token.
- [`vibe_diagnostics`](../vibe_diagnostics) — reporting lexical errors such as invalid characters.

## Development dependencies

- [`insta`](https://crates.io/crates/insta) — snapshot tests for token streams.

## Usage

`vibe_lexer` is the first phase of the compiler pipeline. Its output feeds directly into `vibe_parser`.
