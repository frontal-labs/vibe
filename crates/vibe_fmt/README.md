# vibe_fmt

The canonical formatter for `.vibe` source files.

## Overview

`vibe_fmt` implements the official `.vibe` formatting engine. It parses source into an AST and then pretty-prints it back out using a stable, deterministic style.

## Dependencies

- [`vibe_ast`](../vibe_ast) — AST nodes to format.
- [`vibe_parser`](../vibe_parser) — parsing source before formatting.
- [`vibe_span`](../vibe_span) — preserving source positions during round-trips.

## Usage

`vibe_fmt` is exposed through `vibe_cli` and `vibe_lsp` so that editors can format `.vibe` files on save.
