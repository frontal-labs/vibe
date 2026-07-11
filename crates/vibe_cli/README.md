# vibe_cli

The `vibe` command-line interface.

## Overview

`vibe_cli` is the primary user-facing binary for the `.vibe` toolchain. It orchestrates compilation, formatting, file watching, and other developer workflows from the terminal.

## Features

- Compile `.vibe` files to TypeScript via the compiler facade.
- Format `.vibe` source files with the canonical formatter.
- Watch mode for incremental rebuilds during development.

## Dependencies

- [`vibe_compiler`](../vibe_compiler) — the full compilation pipeline.
- [`vibe_fmt`](../vibe_fmt) — source formatting.
- [`clap`](https://crates.io/crates/clap) — command-line argument parsing.
- [`tempfile`](https://crates.io/crates/tempfile) — temporary directories for test harnesses.
- [`notify`](https://crates.io/crates/notify) — filesystem event watching.

## Development dependencies

- [`assert_cmd`](https://crates.io/crates/assert_cmd) — integration test harness.
- [`predicates`](https://crates.io/crates/predicates) — output assertions in CLI tests.
- [`tempfile`](https://crates.io/crates/tempfile) — isolated test environments.

## Installation

```bash
cargo build --bin vibe
```

The resulting binary will be available at `target/debug/vibe`.

## Usage

```bash
vibe build <file.vibe>
vibe fmt <file.vibe>
vibe watch <directory>
```
