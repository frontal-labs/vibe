# vibe_bundler

Static analysis of a Vibe app's agent/tool TypeScript modules, powering the optimizing bundler: extract each module's imports so `@vibe/build` can build the agent→tool graph and lazily code-split tools (minimal cold-start payloads).

## Overview

`vibe_bundler` is the Rust library that performs static analysis on TypeScript/JavaScript modules to extract import information. It is used by `@vibe/build` to build the agent→tool graph and enable code-splitting of tools for minimal cold-start latency.

## Features

- Extracts import declarations from TypeScript/JavaScript source code
- Identifies tool imports based on a module specifier marker (e.g., `"/tools/"`)
- Provides both structured data and JSON serialization for use in JavaScript bindings
- Built with the [OXC](https://github.com/oxc-project/oxc) parser for fast, standards-compliant parsing
- No unsafe code (`#![forbid(unsafe_code)]`)

## API

### `imports(source: &str) -> Vec<ImportInfo>`

Parses a TypeScript/JavaScript module string and returns all import declarations.

#### `ImportInfo`
- `source`: The module specifier string (e.g., `"../tools/get-order"`)
- `default_local`: The local name for the default import, if any
- `named`: Vector of tuples `(imported_name, local_name)` for named imports

### `tool_edges(agent_source: &str, tool_marker: &str) -> Vec<ToolEdge>`

Extracts tool imports from an agent module. A tool import is any import whose specifier contains `tool_marker`.

#### `ToolEdge`
- `source`: The module specifier of the tool
- `local`: The local binding name for the tool import

### `tool_edges_json(agent_source: &str, tool_marker: &str) -> String`

JSON serialization of `tool_edges` for use in the N-API layer.

### `version() -> &'static str`

Returns the crate version from `Cargo.toml`.

## Dependencies

- [`oxc_allocator`](https://crates.io/crates/oxc_allocator)
- [`oxc_parser`](https://crates.io/crates/oxc_parser)
- [`oxc_ast`](https://crates.io/crates/oxc_ast)
- [`oxc_span`](https://crates.io/crates/oxc_span)
- [`serde`](https://crates.io/crates/serde) (with `derive` feature)
- [`serde_json`](https://crates.io/crates/serde_json)

## Usage

```rust
use vibe_bundler::{tool_edges, tool_edges_json};

let agent_source = r#"
import { getOrderTool } from "../tools/get-order";
"#;
let tool_marker = "/tools/";

let edges = tool_edges(agent_source, tool_marker);
// vec![ToolEdge {
//     source: "../tools/get-order".to_string(),
//     local: "getOrderTool".to_string(),
// }]

let json = tool_edges_json(agent_source, tool_marker);
// r#"[{"source":"../tools/get-order","local":"getOrderTool"}]"#
```

## License

Licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
- MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)

at your option.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the work by you shall be dual licensed as above, without any additional terms or conditions.