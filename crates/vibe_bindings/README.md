# vibe-bindings

Node bindings (napi-rs) exposing Vibe's native accelerators to JavaScript.

Wraps the pre-existing Rust crates (`vibe_bundler`, `vibe_tokenizer`, `vibe_sse`) for the `@vibe/build` and `@vibe/memory` packages.

## Exports (feature `node`)

| Function | Returns | Backing crate | Description |
|----------|---------|---------------|-------------|
| `toolEdges(source, marker)` | `string` | `vibe_bundler` | Agent→tool import graph as JSON |
| `countText(text, family)` | `u32` | `vibe_tokenizer` | Heuristic/BPE token count for a string |
| `countMessages(messagesJson, family)` | `Vec<u32>` | `vibe_tokenizer` | Per-message token counts |
| `sseFold(body)` | `string` | `vibe_sse` | Fold OpenAI SSE body into events + response |
| `version()` | `string` | — | Addon version string |

## Building

```bash
cargo build -p vibe_bindings --features node --release
```

The `node` feature gates the `#[napi]` surface so default builds don't link N-API symbols (keeping `cargo test --workspace` green).
