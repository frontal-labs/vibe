# Nix Development Environment

This directory contains the Nix flake configuration for the Vibe project.

## Quick Start

### Prerequisites

- **Nix with flakes enabled** — [Install Nix](https://nixos.org/download.html) (multi-user install recommended)
  ```bash
  # Enable flakes (add to ~/.config/nix/nix.conf or /etc/nix/nix.conf)
  experimental-features = nix-command flakes
  ```

- **direnv** (optional but recommended) — Auto-load shell on `cd`
  ```bash
  # Install via Nix
  nix profile install nixpkgs#direnv
  # Add to your shell rc (~/.zshrc, ~/.bashrc):
  eval "$(direnv hook zsh)"
  ```

### Enter the dev shell

```bash
# One-time: allow direnv (if using direnv)
direnv allow

# Or manually:
nix develop
```

This provides:
| Tool | Version | Source |
|---|---|---|
| `rustc` / `cargo` | 1.95.0 | rust-overlay |
| `rustfmt` / `clippy` | 1.95.0 | rust-overlay |
| `bun` | 1.3.3 | GitHub releases |
| `node` | 22 | nixpkgs |
| `biome` | latest | nixpkgs |
| `pre-commit` | latest | nixpkgs |
| `git`, `jq`, `curl` | latest | nixpkgs |

### Verify setup

```bash
rustc --version   # 1.95.0
bun --version     # 1.3.3
node --version    # v22.x.x
```

## Available Shells

| Command | Purpose |
|---|---|
| `nix develop` | Full dev environment (default) |
| `nix develop .#debug` | Dev environment with debugging tools (gdb, lldb, strace, ltrace) |
| `nix develop .#profile` | Dev environment with profiling tools (perf, valgrind) |
| `nix develop .#ci` | Minimal CI environment (lint, typecheck, build, test) |
| `nix develop .#ci-rust` | Rust-only CI environment (fmt, clippy, test, bench, napi) |

## Common Tasks

```bash
# Install dependencies (auto-runs on shell enter if missing)
bun install --frozen-lockfile

# Build everything (TS + Rust)
bun run build

# Run all tests
bun run test

# TypeScript only
bun run lint
bun run format:check
bun run typecheck

# Rust only
cargo build --release --workspace
cargo test --workspace
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings

# Build the NAPI addon
cargo build --release -p vibe_napi
```

## CI Integration

The flake defines `checks` that mirror the CI pipeline:

```bash
# Run all checks locally (like CI)
nix flake check

# Run individual checks
nix flake check --check=rust-fmt
nix flake check --check=rust-clippy
nix flake check --check=rust-test
nix flake check --check=ts-lint
nix flake check --check=ts-format
nix flake check --check=ts-typecheck
nix flake check --check=ts-build
nix flake check --check=ts-test
nix flake check --check=ci-check
```

## Git Hooks

Install pre-commit hooks (runs Biome + commitlint):

```bash
pre-commit install --hook-type pre-commit --hook-type commit-msg
```

The flake includes `pre-commit` in the dev shell.

## Cross-compilation

The Rust toolchain includes targets for:
- `aarch64-apple-darwin` (Apple Silicon)
- `x86_64-apple-darwin` (Intel Mac)
- `x86_64-unknown-linux-gnu` (Linux x64)
- `aarch64-unknown-linux-gnu` (Linux ARM64)

Build for a specific target:

```bash
cargo build --release -p vibe_napi --target aarch64-apple-darwin
```

## Caching

### Local

Nix caches builds in `/nix/store`. Re-entering the shell is instant.

### CI (GitHub Actions)

The CI workflows use:
- `DeterminateSystems/nix-installer-action` — installs Nix
- `DeterminateSystems/magic-nix-cache-action` — caches `/nix/store` between runs

Optional: Set up [Cachix](https://cachix.org) for shared team cache:
```bash
# One-time setup
cachix use vybe  # replace with your cache name
```

## Troubleshooting

### "Flake not found" / "Experimental feature not enabled"

Ensure flakes are enabled in your Nix config:
```bash
# Check
nix flake --help

# Enable (user-level)
mkdir -p ~/.config/nix
echo 'experimental-features = nix-command flakes' > ~/.config/nix/nix.conf
```

### Bun version mismatch

The flake fetches Bun 1.3.3 from GitHub releases. If a newer version is needed:
1. Update `BUN_VERSION` in `flake.nix`
2. Run `nix flake lock --update-input nixpkgs` to refresh

### Rust toolchain issues

The flake uses `rust-overlay` to pin Rust 1.95.0 exactly. If you need a different version:
1. Update `channel = "1.95.0"` in `flake.nix`
2. Run `nix flake lock --update-input rust-overlay`

### "No space left on device"

Nix store can grow large. Clean up:
```bash
# Remove old generations
nix-collect-garbage -d

# Or keep last 30 days
nix-collect-garbage --delete-older-than 30d
```

### ARM Linux cross-compilation

Cross-compilation to `aarch64-unknown-linux-gnu` requires the target libraries. The flake adds the target to the toolchain. For full cross-compilation from macOS, use the CI pipeline which runs on native runners.

## File Structure

```
.
├── flake.nix              # Main flake entry point
├── flake.lock             # Locked inputs (commit this)
├── .envrc                 # direnv integration (optional)
└── nix/
    └── README.md          # This file
```

## Updating Dependencies

```bash
# Update all flake inputs
nix flake lock --update-input nixpkgs
nix flake lock --update-input rust-overlay
nix flake lock --update-input crane
nix flake lock --update-input pre-commit-hooks

# Or update everything
nix flake update
```

Then commit the updated `flake.lock`.
