# Vibe for Helix

Helix speaks LSP natively — no plugin needed, just config.

## Prerequisites
```sh
cargo build -p vibe_lsp --release
cp target/release/vibe-lsp ~/.local/bin/   # on $PATH
```

## Setup
Merge `languages.toml` into `~/.config/helix/languages.toml`, then run
`hx --health vibe` to confirm the server is found. Open any `.vibe` file to get
diagnostics, hover, completion, and go-to-definition.
