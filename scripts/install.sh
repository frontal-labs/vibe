#!/bin/sh
# Install the Vibe CLI.
#
# Vibe is a TypeScript-native framework — the `vibe` CLI ships as an npm package.
# Install it with your JS package manager:
#
#     bun add -g @vibe/cli      # or: npm i -g @vibe/cli / pnpm add -g @vibe/cli
#
# The optimizing build (`vibe build`) uses an optional native analysis addon
# (`vibe_napi`, oxc-based) for speed; without it, a pure-TypeScript fallback is used,
# so no separate binary download is required.
set -eu

echo "Vibe is a TypeScript package. Install the CLI with:"
echo "  bun add -g @vibe/cli"
echo "(or npm i -g @vibe/cli)"
