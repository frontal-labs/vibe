# Vibe for Zed

A Zed extension providing the `.vibe` language and wiring Zed's LSP to the
`vibe-lsp` binary (diagnostics, hover, completion, go-to-definition, format).

## Prerequisites
```sh
cargo build -p vibe_lsp --release
cp target/release/vibe-lsp ~/.local/bin/   # must be on $PATH
```

## Install (dev extension)
In Zed: `zed: install dev extension` → select this `editors/zed` directory.
Zed launches `vibe-lsp` from your `PATH` for `Vibe` files.

Note: Zed prefers a Tree-sitter grammar for rich highlighting; this extension
ships an LSP-first setup and a minimal language config. A `tree-sitter-vibe`
grammar can be added later under `grammars/`.
