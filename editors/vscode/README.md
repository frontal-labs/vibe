# Vibe for VS Code

Syntax highlighting (TextMate grammar) and language support (diagnostics,
completion, hover, go-to-definition) for `.vibe`, backed by the `vibe-lsp`
language server.

Build the server with `cargo build -p vibe_lsp --release` and set `vibe.lspPath`
to `target/release/vibe-lsp`, or put `vibe-lsp` on your `PATH`.
