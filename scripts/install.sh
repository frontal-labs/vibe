#!/bin/sh
# Install the prebuilt `vibe` CLI. Usage: curl -fsSL <url>/install.sh | sh
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
  *) echo "vibe: unsupported platform $os-$arch. Try 'cargo install --git https://github.com/$REPO vibe_cli'." >&2; exit 1 ;;
esac

if [ "$VERSION" = "latest" ]; then
  url="https://github.com/$REPO/releases/latest/download/vibe-$target.tar.gz"
else
  url="https://github.com/$REPO/releases/download/$VERSION/vibe-$target.tar.gz"
fi

echo "vibe: downloading $target ($VERSION)..."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$url" -o "$tmp/vibe.tar.gz"
tar -xzf "$tmp/vibe.tar.gz" -C "$tmp"
mkdir -p "$BIN_DIR"
install -m 0755 "$tmp/vibe" "$BIN_DIR/vibe"
echo "vibe: installed to $BIN_DIR/vibe"
case ":$PATH:" in *":$BIN_DIR:"*) ;; *) echo "vibe: add $BIN_DIR to your PATH." ;; esac
