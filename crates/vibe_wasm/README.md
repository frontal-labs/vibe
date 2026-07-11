# vibe_wasm

WASM bindings for the Vibe browser playground.

## Overview

`vibe_wasm` compiles the Vibe compiler to WebAssembly using `wasm-bindgen`, making it possible to run `.vibe` compilation directly in the browser. This powers the interactive playground and online REPL.

## Crate types

- `cdylib` — the `.wasm` module loaded by the browser.
- `rlib` — the pure Rust API for testing and reuse.

## Dependencies

- [`vibe_compiler`](../vibe_compiler) — the compiler pipeline executed inside the WASM sandbox.
- [`wasm-bindgen`](https://crates.io/crates/wasm-bindgen) — JS/WASM interop (optional, enabled with the `wasm` feature).

## Features

- `wasm` — enables `wasm-bindgen` and produces the browser-compatible module.

## Building

```bash
cargo build -p vibe_wasm --target wasm32-unknown-unknown --features wasm --release
wasm-bindgen target/wasm32-unknown-unknown/release/vibe_wasm.wasm \
  --out-dir pkg \
  --target web
```

## Usage

The generated JS glue code exposes the compiler API to the browser:

```javascript
import init, { compileVibe } from './pkg/vibe_wasm.js';

await init();
const result = compileVibe('hello.vibe', '...source...');
```
