# vibe_emit

Code generation from `.vibe` AST to TypeScript with source maps.

## Overview

`vibe_emit` is the codegen backend of the `.vibe` compiler. It takes a checked AST and emits equivalent TypeScript source code, producing source maps so that runtime errors can be mapped back to the original `.vibe` source.

## Dependencies

- [`vibe_ast`](../vibe_ast) — the AST being lowered to TypeScript.
- [`vibe_span`](../vibe_span) — source positions for source-map generation.

## Development dependencies

- [`vibe_parser`](../vibe_parser) — used in round-trip and snapshot tests.
- [`insta`](https://crates.io/crates/insta) — snapshot testing for emitted output.

## Usage

`vibe_emit` is invoked by `vibe_compiler` after semantic analysis completes.
