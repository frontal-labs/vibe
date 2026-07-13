# vibe_napi

Node.js bindings for the Vibe bundler's static analysis.

## Overview

`vibe_napi` exposes [`vibe_bundler`](../vibe_bundler)'s TypeScript import analysis to
JavaScript/TypeScript via N-API (`napi-rs`). It compiles to a `.node` addon so `@vibe/build`
can build an agent→tool graph in-process — without spawning a separate Rust process — and
code-split tools into lazily-loaded chunks for small cold starts.

The addon is an **optional accelerator**: `@vibe/build` works without it and falls back to a
pure-TypeScript analysis. There is no `.vibe` language compiler here — Vibe apps are plain
TypeScript.

## Crate types

- `cdylib` — the `.node` addon loaded by Node.js (built with `--features node`).
- `rlib` — the pure Rust API for testing and reuse.

## N-API surface (feature `node`)

- `tool_edges(agent_source: string, tool_marker: string) -> string` — JSON array of the
  tools an agent module imports (module specifier + local binding), where the import
  specifier contains `tool_marker` (e.g. `"/tools/"`).
- `version() -> string` — the addon version.

## Dependencies

- [`vibe_bundler`](../vibe_bundler) — the static-analysis library this crate wraps.
- [`napi`](https://crates.io/crates/napi) — N-API bindings (optional, `node` feature).
- [`napi-derive`](https://crates.io/crates/napi-derive) — N-API export macros (optional).

## Build dependencies

- [`napi-build`](https://crates.io/crates/napi-build) — build script for N-API registration.

## Features

- `node` — enables `napi`/`napi-derive` and generates the `.node` addon. The default build
  omits it so `cargo test --workspace` and CI stay green without linking Node's N-API symbols.

## Building

```bash
cargo build -p vibe_napi --features node --release
```

## Usage

```javascript
const addon = require('./vibe_napi.node')
const edges = JSON.parse(addon.tool_edges(agentSource, '/tools/'))
// -> [{ source: "../tools/get-order", local: "getOrderTool" }, ...]
```
