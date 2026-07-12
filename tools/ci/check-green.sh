#!/usr/bin/env bash
# Run every gate the CI runs, locally, and stop at the first failure.
# Usage: bash tools/ci/check-green.sh
set -euo pipefail

echo "▶ lint";      bun lint
echo "▶ format";    bun format:check
echo "▶ typecheck"; bun typecheck
echo "▶ test";      bun test
echo "▶ test:types"; bun test:types
echo "▶ cargo fmt";    cargo fmt --all --check
echo "▶ cargo clippy"; cargo clippy --workspace --all-targets -- -D warnings
echo "▶ cargo test";   cargo test --workspace
echo "✓ all gates green"
