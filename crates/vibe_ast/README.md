# vibe_ast

The abstract syntax tree (AST) for the `.vibe` language.

## Overview

`vibe_ast` defines the core data structures representing parsed `.vibe` programs. All other compiler crates that need to inspect or transform source code depend on this crate.

## Dependencies

- [`vibe_span`](../vibe_span) — source positions attached to every AST node.

## Usage

Add `vibe_ast` to your `Cargo.toml` when you need to work with the typed representation of `.vibe` code after parsing.
