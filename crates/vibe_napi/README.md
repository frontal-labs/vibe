# vibe_napi

Node.js bindings for the Vibe compiler.

## Overview

`vibe_napi` exposes the `.vibe` compiler to JavaScript and TypeScript via N-API (`napi-rs`). It compiles to a `.node` addon so that Node.js tooling (bundlers, frameworks, editors) can invoke the Vibe compiler directly without spawning a Rust process.

## Crate types

- `cdylib` — the `.node` addon loaded by Node.js.
- `rlib` — the pure Rust API for testing and reuse.

## Dependencies

- [`vibe_compiler`](../vibe_compiler) — the compiler pipeline invoked from Node.
- [`napi`](https://crates.io/crates/napi) — N-API bindings (optional, enabled with the `node` feature).
- [`napi-derive`](https://crates.io/crates/napi-derive) — procedural macros for N-API exports (optional).

## Build dependencies

- [`napi-build`](https://crates.io/crates/napi-build) — build script for N-API module registration.

## Features

- `node` — enables the `napi` and `napi-derive` dependencies and generates the `.node` addon.

## Building

```bash
cargo build -p vibe_napi --features node --release
```

## Usage

```javascript
const { compileVibe } = require('./vibe_napi.node');
const result = compileVibe('hello.vibe', '...source...');
```
