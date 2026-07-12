#!/bin/sh
# Install the prebuilt `vibe-lsp` language server (used by the editor integrations).
#
# The `vibe` CLI is now a TypeScript package — install it with your JS package
# manager instead:  bun add -g @vibe/cli   (or npm i -g @vibe/cli)
#
# Usage: curl -fsSL <url>/install.sh | sh
set -eu

REPO="vibe-lang/vibe"
VERSION="${VIBE_VERSION:-latest}"
BIN_DIR="${VIBE_BIN_DIR:-$HOME/.local/bin}"

os="$(uname -s)"
arch="$(uname -m)"
case "$os-$arch" in
  Darwin-arm64)  target="aarch64-apple-darwin" ;;
  Darwin-x86_64) target="x86_64-apple-darwin" ;;
  Linux-x86_64)  target="x86_64-unknown-linux-gnu" ;;
  Linux-aarch64) target="aarch64-unknown-linux-gnu" ;;
  *) echo "vibe-lsp: unsupported platform $os-$arch. Try 'cargo install --git https://github.com/$REPO vibe_lsp'." >&2; exit 1 ;;
esac

if [ "$VERSION" = "latest" ]; then
  url="https://github.com/$REPO/releases/latest/download/vibe-lsp-$target.tar.gz"
else
  url="https://github.com/$REPO/releases/download/$VERSION/vibe-lsp-$target.tar.gz"
fi

echo "vibe-lsp: downloading $target ($VERSION)..."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$url" -o "$tmp/vibe-lsp.tar.gz"
tar -xzf "$tmp/vibe-lsp.tar.gz" -C "$tmp"
mkdir -p "$BIN_DIR"
install -m 0755 "$tmp/vibe-lsp" "$BIN_DIR/vibe-lsp"
echo "vibe-lsp: installed to $BIN_DIR/vibe-lsp"
case ":$PATH:" in *":$BIN_DIR:"*) ;; *) echo "vibe-lsp: add $BIN_DIR to your PATH." ;; esac
echo "The vibe CLI is a JS package: bun add -g @vibe/cli"
