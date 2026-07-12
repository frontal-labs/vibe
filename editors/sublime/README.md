# Vibe for Sublime Text

Uses the [LSP](https://packagecontrol.io/packages/LSP) package to talk to
`vibe-lsp`, plus a `.sublime-syntax` for highlighting.

## Prerequisites
- Install the `LSP` package (Package Control).
- Build the server: `cargo build -p vibe_lsp --release` and put `vibe-lsp` on `$PATH`.

## Install
Copy `LSP-vibe.sublime-settings` into your Sublime `Packages/User/` directory and
`Vibe.sublime-syntax` into `Packages/User/`. Restart Sublime; `.vibe` files bind to
the Vibe syntax and the `vibe-lsp` server starts automatically.
