# Vibe for Neovim

Syntax highlighting + LSP (diagnostics, hover, completion, go-to-definition,
formatting) for `.vibe` files, powered by the `vibe-lsp` binary.

## Prerequisites
Build and install the language server so it's on your `PATH`:
```sh
cargo build -p vibe_lsp --release
cp target/release/vibe-lsp ~/.local/bin/   # or anywhere on $PATH
```

## Setup (nvim-lspconfig)
Add to your config (`init.lua`). Requires `neovim/nvim-lspconfig`.
```lua
require("vibe").setup()
```
See `vibe.lua` for the implementation — it registers the `vibe` filetype for
`*.vibe` and starts `vibe-lsp` over stdio.
