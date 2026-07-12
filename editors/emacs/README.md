# Vibe for Emacs

`vibe-mode` gives font-lock highlighting and, via Eglot (built into Emacs 29+),
full LSP features from `vibe-lsp`.

## Prerequisites
```sh
cargo build -p vibe_lsp --release
cp target/release/vibe-lsp ~/.local/bin/   # on $PATH
```

## Install
```elisp
(add-to-list 'load-path "/path/to/vibe/editors/emacs")
(require 'vibe-mode)
```
Open a `.vibe` file and run `M-x eglot` (or enable `eglot-ensure`) for diagnostics,
hover, completion, and go-to-definition.
