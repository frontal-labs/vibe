# Nix Implementation Plan for Vibe

**Date:** 2026-07-25
**Version:** 1.0
**Status:** Draft

---

## 1. Executive Summary

This plan defines how to introduce **Nix flakes** as a first-class development and build environment for the Vibe monorepo. Nix will provide reproducible toolchains, a unified developer experience, and hermetic CI builds. The Rust side is the primary beneficiary (cross-compilation, toolchain pinning); the TypeScript side benefits from consistent Bun/Node tooling.

### Goals

| Goal | Rationale |
|---|---|
| **Reproducible dev environment** | One `nix develop` provides pinned Rust 1.95, Bun 1.3.3, Node 22, and all tooling |
| **Hermetic CI** | Eliminate reliance on `rustup show` / `setup-bun` / `setup-node` actions — same environment locally and in CI |
| **Cross-compilation** | Simplify napi addon builds for all 5 release targets via Nix's cross infrastructure |
| **Onboarding** | New contributors run `nix develop` instead of installing rustup, bun, node, pre-commit separately |
| **Caching** | Nix binary cache for Rust artifacts (faster CI than `rust-cache`) |

### Non-goals

| Topic | Why not |
|---|---|
| Nix-based npm publishing | The npm/bun ecosystem is already mature for package building; Nix wrapping adds complexity with little benefit |
| Replacing Docker for production | Docker is the deployment target (oven/bun image); Nix doesn't replace that |
| NixOS module | Vibe is a TypeScript library, not a system service |
| Windows Nix support | Nix on Windows is experimental; the release workflow keeps its Windows runner |

---

## 2. Existing Architecture Summary

### Build systems

```
┌─────────────────────────────────────────────────────┐
│                  Turborepo (turbo.json)              │
│  ┌────────────────────────────────────┐             │
│  │    bun workspace (packages/*)      │             │
│  │    Vite → dist/*.js + .cjs + .d.ts │             │
│  │    Vitest tests                    │             │
│  └────────────────────────────────────┘             │
│  ┌────────────────────────────────────┐             │
│  │    Cargo workspace (crates/*)      │             │
│  │    cargo build — optional accelerator            │
│  │    napi-rs → .node addon           │             │
│  └────────────────────────────────────┘             │
└─────────────────────────────────────────────────────┘
```

### Tool requirements

| Tool | Version | Source |
|---|---|---|
| Rust | 1.95 (MSRV) | `rust-toolchain.toml` + `rustup` |
| Bun | 1.3.3 | `package.json` packageManager field |
| Node | >=20 (22 in CI) | `setup-node` action |
| pre-commit | latest | Python via pipx |
| Biome | 2.5.3 | npm devDependency |
| Turbo | 2.3.3 | npm devDependency |

### CI architecture (current)

```
ci.yml:
  quality:    ubuntu-latest  → bun install → lint + format:check + typecheck
  build-test: ubuntu-24.04   → bun install → build + test
  rust:       ubuntu-24.04   → rustup show → fmt + clippy + test + bench + napi build

release-binaries.yml:
  napi:       macos/ubuntu/windows → cargo build --release per target → npm tarball
  publish-npm:                    → npm publish
  release:                        → GitHub Release

release.yml:
  changesets: ubuntu-24.04 → bun install → changesets/action (publish or PR)
```

### Rust crate dependency graph

```
vibe_shared ──► vibe_errors ──► vibe_cancellation ──► vibe_retry ──► vibe_scheduler ──► vibe_execution
                                                                                            │
                                                                                            ▼
                                                                                      vibe_tools ──► vibe_model
                                                                                            │
                                                                                            ▼
                                                                                      vibe_napi (napi-rs)
                         vibe_bundler ──► vibe_bindings (napi-rs, optional node feature)
                         vibe_tokenizer
                         vibe_sse
```

### N-API release targets

| Target | OS | Arch | CI Runner |
|---|---|---|---|
| `aarch64-apple-darwin` | macOS | arm64 | macos-latest |
| `x86_64-apple-darwin` | macOS | x64 | macos-latest |
| `x86_64-unknown-linux-gnu` | Linux | x64 | ubuntu-latest |
| `aarch64-unknown-linux-gnu` | Linux | arm64 | ubuntu-latest |
| `x86_64-pc-windows-msvc` | Windows | x64 | windows-latest |

---

## 3. Flake Architecture

### 3.1 File layout

```
nix/
├── README.md                           # How to use Nix in this repo
├── flake-module.nix                    # Flake outputs (devShells, packages, checks, formatter)
├── inputs/
│   └── default.nix                     # Centralized flake input configuration
├── toolchains/
│   ├── rust.nix                        # Rust toolchain (via rust-overlay or fenix)
│   ├── bun.nix                         # Bun derivation (from nixpkgs or fetch)
│   └── node.nix                        # Node.js derivation
├── devshells/
│   ├── default.nix                     # Main development shell (full tooling)
│   ├── minimal.nix                     # CI shell (just build essentials)
│   └── ci-rust.nix                     # Rust-only CI shell
├── packages/
│   ├── vibe-napi.nix                   # Rust napi addon build per-target
│   └── vibe-check.nix                  # Combined CI check (lint + build + test)
├── overlays/
│   └── default.nix                     # Project-specific package overlays
└── utils/
    ├── crane.nix                       # CraneLib configuration for Rust workspace
    └── versions.nix                    # Centralized version constants
```

### 3.2 Flake inputs

```nix
# flake.nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    nixpkgs-unstable.url = "github:NixOS/nixpkgs/nixos-unstable";

    flake-utils.url = "github:numtide/flake-utils";

    # Rust toolchain — provides specific Rust versions not in nixpkgs
    rust-overlay.url = "github:oxalica/rust-overlay";

    # Crane — build Rust workspaces with caching
    crane.url = "github:ipetkov/crane";

    # Pre-commit hooks (nix-friendly alternative to pip-based pre-commit)
    pre-commit-hooks.url = "github:cachix/pre-commit-hooks.nix";
  };
}
```

**Rationale for each input:**

| Input | Purpose |
|---|---|
| `nixpkgs` | Stable packages for Node, Bun, and system tools |
| `nixpkgs-unstable` | For Bun if stable version is too old |
| `flake-utils` | Per-system output generation (`eachDefaultSystem`) |
| `rust-overlay` | Precise Rust version pinning (1.95.0) with components and targets |
| `crane` | Composable, cacheable Rust workspace builds |
| `pre-commit-hooks.nix` | Nix-managed pre-commit hooks (replaces pip-based pre-commit) |

### 3.3 Supported systems

Nix will support the three systems used in CI + development:

```nix
systems = [
  "aarch64-darwin"   # Apple Silicon Macs (dev + CI)
  "x86_64-darwin"    # Intel Macs (dev)
  "x86_64-linux"     # Linux (dev + CI)
];
```

Windows (`x86_64-windows`) is excluded — the release workflow keeps its native Windows runner. Cross-compilation to `aarch64-linux` and `x86_64-windows` can be added to CI via pkgsCross but is not in the initial scope.

---

## 4. Development Shell Design

### 4.1 Default devShell (`nix develop` / `direnv allow`)

Provides the **complete development environment** matching `CONTRIBUTING.md`:

```
Shell environment:
  - rustc 1.95.0 + rustfmt + clippy   (from rust-overlay, respects rust-toolchain.toml)
  - cargo 1.95.0
  - bun 1.3.3                          (from nixpkgs or fetch, pinned)
  - nodejs_22 + corepack               (for npm global installs)
  - biome                              (from nixpkgs)
  - pre-commit                         (from nixpkgs, Python-based)
  - turborepo                          (from npm, but provided by bun workspace)
  - git + curl + jq + typical dev utils

Shell hooks:
  - auto-creates .nix-shell-timestamp for cache invalidation
  - runs `bun install` if node_modules missing (or prompts)
  - sets NODE_ENV=development, CI=false
  - sets VIBE_NATIVE_ADDON path (points to local cargo-built .node if present)
```

### 4.2 CI devShell (`nix develop .#ci`)

Minimal environment for CI jobs:

```
  - rustc 1.95.0 + clippy (no rustfmt — fmt runs separately)
  - bun 1.3.3
  - nodejs_22
  - No biome pre-commit, no dev-only tools

  Environment:
  - CI=true
  - TERM=dumb
```

### 4.3 Rust-only devShell (`nix develop .#rust`)

For contributors working only on `crates/*`:

```
  - rustc 1.95.0 + rustfmt + clippy + all 5 release targets
  - cargo + cargo-fuzz
  - bun + nodejs_22 (for napi test runs)
```

### 4.4 Env variables set by the shell

```nix
shellHook = ''
  # Project-rooted environment
  export VIBE_ROOT="$PWD"
  
  # Point cargo at our toolchain
  export CARGO_HOME="$PWD/.cargo"
  
  # Enable corepack for npm global installs if needed
  export COREPACK_ENABLE_STRICT="0"
  
  # Auto-install dependencies if missing
  if [ ! -d "node_modules" ]; then
    echo "→ Installing bun dependencies..."
    bun install --frozen-lockfile
  fi
  
  # Detect pre-commit hooks and prompt
  if [ ! -f ".git/hooks/pre-commit" ]; then
    echo "→ Run 'pre-commit install --hook-type pre-commit --hook-type commit-msg' to install git hooks"
  fi
'';
```

---

## 5. Package Derivations

### 5.1 Bun derivation

Bun may not be available at the exact version (1.3.3) in nixpkgs. Two approaches:

**Preferred**: Use `pkgs.bun` from nixpkgs if version >= 1.3.3 (pin via `nixpkgs` version).
**Fallback**: Fetch prebuilt binary directly:

```nix
{ lib, stdenv, fetchurl, autoPatchelfHook, ... }:
let
  version = "1.3.3";
  systemMap = {
    x86_64-linux = "x86_64-linux";
    aarch64-linux = "aarch64-linux";
    x86_64-darwin = "x86_64-darwin";
    aarch64-darwin = "aarch64-darwin";
  };
  bunSystem = systemMap.${stdenv.system};
in stdenv.mkDerivation {
  pname = "bun";
  inherit version;
  src = fetchurl {
    url = "https://github.com/oven-sh/bun/releases/download/bun-v${version}/bun-${system}-${version}.zip";
    # hash is per-platform; use SRI format
  };
  # Unzips, installs single binary to $out/bin/bun
  sourceRoot = ".";
  installPhase = ''
    mkdir -p $out/bin
    cp bun $out/bin/bun
    chmod +x $out/bin/bun
  '';
}
```

### 5.2 Rust napi addon (per-target cross-compilation)

For CI cross-compilation (not local dev), Nix provides the `pkgsCross` infrastructure:

```nix
# nix/packages/vibe-napi.nix
{ lib, crane, rustToolchain, pkgs, target ? null, ... }:

let
  # Select the appropriate pkgs set
  crossPkgs = if target != null then pkgs.pkgsCross.${target} else pkgs;
  
  # Crane lib with target-specific rustc
  craneLib = crane.overrideToolchain rustToolchain;
  
  # Common arguments for all targets
  commonArgs = {
    pname = "vibe-napi";
    version = "0.1.0";
    src = ./../../.;
    cargoExtraArgs = "-p vibe_napi --release";
    # Only build the specific crate, not the whole workspace
    cargoArtifacts = null; # Set to previous build for incremental
    buildInputs = [ ... ]; # target-specific libs
  };
in
craneLib.buildPackage (commonArgs // {
  # Post-build: rename .so/.dylib/.dll to .node
  postInstall = ''
    mkdir -p $out/lib
    find $out/lib -name "libvibe_napi.*" -exec cp {} $out/vibe_napi.node \;
  '';
})
```

**Target mapping for pkgsCross:**

| Nix cross target | CI triple | Config string |
|---|---|---|
| `aarch64-darwin` | `aarch64-apple-darwin` | `pkgsCross.aarch64-darwin` |
| `x86_64-darwin` | `x86_64-apple-darwin` | `(not needed — native)` |
| `x86_64-linux` | `x86_64-unknown-linux-gnu` | `(not needed — native)` |
| `aarch64-linux` | `aarch64-unknown-linux-gnu` | `pkgsCross.aarch64-multiplatform` |
| `x86_64-windows` | `x86_64-pc-windows-msvc` | `pkgsCross.mingwW64` |

**NOTE:** Windows cross-compilation from Nix is complex (needs mingw). The release workflow keeps its native Windows runner. Only the macOS and Linux targets are practical Nix cross-build candidates.

---

## 6. CI Integration

### 6.1 Using Nix in GitHub Actions

The `DeterminateSystems/nix-installer-action@v12` + `DeterminateSystems/magic-nix-cache-action@v4` replaces the per-tool setup steps.

**Current CI (ci.yml — quality job):**
```yaml
- uses: actions/checkout@v4
- uses: oven-sh/setup-bun@v1
- uses: actions/setup-node@v4
- run: bun install --frozen-lockfile
- run: bun lint
- run: bun format:check
- run: bun typecheck
```

**With Nix:**
```yaml
- uses: actions/checkout@v4
- uses: DeterminateSystems/nix-installer-action@v12
- uses: DeterminateSystems/magic-nix-cache-action@v4
- uses: DeterminateSystems/flake-checker-action@v5
- run: nix develop .#ci --command bun install --frozen-lockfile
- run: nix develop .#ci --command bash -c "bun lint && bun format:check && bun typecheck"
```

Or, with a `nix develop` shell entering a persistent context:
```yaml
- uses: actions/checkout@v4
- uses: DeterminateSystems/nix-installer-action@v12
- uses: DeterminateSystems/magic-nix-cache-action@v4
- name: Install dependencies
  run: nix develop .#ci --command bun install --frozen-lockfile
- name: Lint & typecheck
  run: nix develop .#ci --command bash -c "bun lint && bun format:check && bun typecheck"
```

### 6.2 Rust CI with Nix

**Current CI (ci.yml — rust job):**
```yaml
- run: rustup show
- uses: Swatinem/rust-cache@v2
- run: cargo fmt --all --check
- run: cargo clippy --workspace --all-targets -- -D warnings
- run: cargo test --workspace
- run: cargo bench --workspace --no-run
- run: cargo build -p vibe_napi --release
```

**With Nix:**
```yaml
- uses: actions/checkout@v4
- uses: DeterminateSystems/nix-installer-action@v12
- uses: DeterminateSystems/magic-nix-cache-action@v4
- run: nix develop .#ci-rust --command cargo fmt --all --check
- run: nix develop .#ci-rust --command cargo clippy --workspace --all-targets -- -D warnings
- run: nix develop .#ci-rust --command cargo test --workspace
- run: nix develop .#ci-rust --command bash -c "cargo bench --workspace --no-run && cargo build -p vibe_napi --release"
```

### 6.3 Flake checks for CI

Define `checks` that encapsulate each CI gate:

```nix
checks = {
  rust-fmt = craneLib.cargoFmt { ... };
  rust-clippy = craneLib.cargoClippy {
    cargoClippyExtraArgs = "--all-targets -- -D warnings";
  };
  rust-test = craneLib.cargoTest { ... };
  rust-bench = craneLib.cargoBench { cargoBenchExtraArgs = "--no-run"; };
  vibe-napi-build = craneLib.buildPackage { pname = "vibe_napi"; ... };
  ts-lint = ...;    # bun lint wrapper
  ts-format = ...;  # bun format:check wrapper
  ts-typecheck = ...; # bun typecheck wrapper
  ts-build = ...;   # turbo run build wrapper (partial — bun workspace)
  ts-test = ...;    # bun test wrapper
};
```

These can be run via `nix flake check` and map 1:1 to CI job steps.

---

## 7. Nix binary cache strategy

| Cache | Purpose | Setup |
|---|---|---|
| `nixpkgs` (built-in) | nixpkgs package cache | Default |
| `cachix/vybe` (project) | Rust crate build artifacts, project derivations | `cachix use vybe` |
| GitHub Actions cache | Nix store via `magic-nix-cache` | Existing Actions cache |

Setting up a **Cachix** cache (`vybe.cachix.org`) is recommended to share Rust build artifacts between CI runs and developers:

```yaml
# CI step to push to cache
- uses: cachix/cachix-action@v14
  with:
    name: vybe
    authToken: '${{ secrets.CACHIX_AUTH_TOKEN }}'
```

---

## 8. Migration Steps (Phase Plan)

### Phase 0: Foundation (1-2 days)

**Files to create:**
- `flake.nix` — main flake entry point
- `flake.lock` — generated by `nix flake lock`
- `nix/README.md` — Nix usage guide for contributors
- `nix/inputs/default.nix` — organized input definitions

**Implementation:**
1. Create `flake.nix` with inputs: nixpkgs, nixpkgs-unstable, flake-utils, rust-overlay, crane
2. Create a basic devShell providing: rustc (from rust-overlay), bun (from nixpkgs), nodejs_22
3. Verify `nix develop` works on aarch64-darwin and x86_64-linux
4. Verify `rustc --version`, `bun --version`, `node --version` match pin versions

**Validation:**
- `nix develop --command bash -c 'rustc --version && bun --version && node --version'`
- All three tool versions match project expectations

### Phase 1: Rust toolchain + Crane (1-2 days)

**Files to create/modify:**
- `nix/toolchains/rust.nix` — Rust toolchain with components and targets
- `nix/utils/crane.nix` — Crane configuration for workspace

**Implementation:**
1. Configure rust-overlay to provide exactly Rust 1.95.0 + rustfmt + clippy
2. Add `allTargets = ["aarch64-apple-darwin" "x86_64-apple-darwin" "x86_64-unknown-linux-gnu"]` to toolchain
3. Configure Crane to build the full Cargo workspace
4. Add `aarch64-unknown-linux-gnu` target for cross-compilation
5. Create `craneLib.mkCargoDerivation` for workspace caching

**Validation:**
- `nix develop --command cargo build --workspace` succeeds
- `nix develop --command cargo test --workspace` passes
- `nix develop --command cargo clippy --all-targets -- -D warnings` passes
- `nix develop --command cargo build -p vibe_napi --release` produces lib

### Phase 2: DevShell refinement + pre-commit hooks (1 day)

**Files to create/modify:**
- `nix/devshells/default.nix` — complete devShell
- `nix/devshells/minimal.nix` — CI shell
- `nix/devshells/ci-rust.nix` — Rust CI shell
- `nix/toolchains/bun.nix` — Bun fetch derivation (if nixpkgs version is wrong)

**Implementation:**
1. Populate devShell with full tooling: rustc, bun, node, biome, pre-commit, git, jq
2. Add shellHook for auto-installing dependencies and setting env vars
3. Integrate pre-commit-hooks.nix:
   ```nix
   pre-commit-check = pre-commit-hooks.lib.${system}.run {
     src = ./.;
     hooks = {
       biome.enable = true;
       commitlint.enable = true;
     };
   };
   ```
4. Create minimal CI shell (no extra tools)
5. Add `.envrc` for `direnv` support (optional but recommended)

**Environment variables set by devShell:**
| Variable | Value | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Node environment |
| `CI` | (unset in dev, `true` in CI) | CI mode flag |
| `VIBE_ROOT` | `$PWD` | Project root reference |

**Validation:**
- `nix develop` drops into shell with all tools on PATH
- `bun install --frozen-lockfile` succeeds
- `bun run build` succeeds
- `bun run test` passes

### Phase 3: CI migration (2-3 days)

**Files to modify:**
- `.github/workflows/ci.yml` — replace per-tool setup with Nix
- `.github/workflows/release-binaries.yml` — optional Nix cross-build step
- `.github/workflows/pr-checks.yml` — no changes needed

**Implementation:**
1. Add Nix installer action to CI workflows
2. Create CI-specific shell (`.#ci` and `.#ci-rust`)
3. Replace `setup-bun` + `setup-node` + `rustup show` with `nix develop` wrappers
4. Configure `magic-nix-cache` and optionally `cachix` for Rust caching
5. Keep one non-Nix Rust job as a reference — run both in parallel and compare timing

**Updated CI pipeline (ci.yml):**
```yaml
jobs:
  quality:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: DeterminateSystems/nix-installer-action@v12
      - uses: DeterminateSystems/magic-nix-cache-action@v4
      - run: nix develop .#ci --command bun install --frozen-lockfile
      - run: nix develop .#ci --command bash -c "bun lint && bun format:check && bun typecheck"

  build-and-test:
    runs-on: ubuntu-24.04
    needs: [quality]
    steps:
      - uses: actions/checkout@v4
      - uses: DeterminateSystems/nix-installer-action@v12
      - uses: DeterminateSystems/magic-nix-cache-action@v4
      - uses: actions/cache@v4
        with:
          path: .turbo
          key: ${{ runner.os }}-turbo-${{ github.sha }}
          restore-keys: ${{ runner.os }}-turbo-
      - run: nix develop .#ci --command bun install --frozen-lockfile
      - run: nix develop .#ci --command bun run build
      - run: nix develop .#ci --command bun run test

  rust:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: DeterminateSystems/nix-installer-action@v12
      - uses: DeterminateSystems/magic-nix-cache-action@v4
      - run: nix develop .#ci-rust --command bash -c "
          cargo fmt --all --check &&
          cargo clippy --workspace --all-targets -- -D warnings &&
          cargo test --workspace &&
          cargo bench --workspace --no-run &&
          cargo build -p vibe_napi --release"
```

### Phase 4: Nix checks + nix flake check (1 day)

**Files to create/modify:**
- `nix/packages/vibe-napi.nix` — Rust napi package derivation
- `nix/packages/vibe-check.nix` — combined check derivation
- `flake.nix` — add `checks` output

**Implementation:**
1. Define individual checks via Crane: `cargoFmt`, `cargoClippy`, `cargoTest`, `cargoBuild`
2. Define TypeScript checks as `runCommand` derivations calling bun
3. Wire checks into `flake.nix` under `checks.<system>`
4. Verify `nix flake check` passes locally
5. Optionally add `checks` as a CI job step: `nix flake check -L`

**Validation:**
- `nix flake check` runs all checks successfully
- `nix build .#checks.x86_64-linux.rust-test` builds and runs tests

### Phase 5: Cross-compilation for napi (2-3 days, optional)

**Files to create/modify:**
- `nix/packages/vibe-napi.nix` — full cross-compilation logic
- `nix/overlays/default.nix` — platform-specific build inputs
- `.github/workflows/release-binaries.yml` — add Nix-based build matrix option

**Implementation:**
1. For each Unix target, create a Crane derivation using `pkgsCross.<target>`
2. Handle macOS cross-compilation (requires `darwin.apple_sdk` frameworks)
3. Handle Linux aarch64 cross-compilation (requires QEMU binfmt for testing)
4. Windows: do not implement via Nix — keep native windows-2022 runner
5. Compare Nix-built artifacts with current CI-built artifacts (hash comparison)

**Validation:**
- `nix build .#vibe-napi.aarch64-darwin` produces a working `.dylib`
- `nix build .#vibe-napi.x86_64-linux` produces a working `.so`
- `nix build .#vibe-napi.aarch64-linux` produces a working `.so`
- Artifact binaries are functionally equivalent to CI-built versions

### Phase 6: Documentation + contributor onboarding (1 day)

**Files to modify:**
- `CONTRIBUTING.md` — add Nix section alongside existing setup
- `nix/README.md` — Nix usage reference
- `docs/contributing/00-contributing.md` — update dev setup section

**Documentation content:**
```markdown
## Nix-based development (optional but recommended)

### Prerequisites
- [Nix](https://nixos.org/download/) with flakes enabled
- [direnv](https://direnv.net/) (optional, for automatic shell loading)

### Setup
```bash
# Enter the development environment
nix develop

# Or with direnv:
echo "use flake" > .envrc && direnv allow
```

### What you get
- Rust 1.95 with rustfmt and clippy
- Bun 1.3.3
- Node.js 22
- All project tooling on PATH

### CI
All CI jobs use the same Nix environment. Run locally:
```bash
nix flake check
```
```

---

## 9. Complete Flake Structure

### 9.1 Main flake.nix

```nix
{
  description = "Vibe — production AI agent framework";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
    crane.url = "github:ipetkov/crane";
    pre-commit-hooks.url = "github:cachix/pre-commit-hooks.nix";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      rust-overlay,
      crane,
      pre-commit-hooks,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ (import rust-overlay) ];
        };

        # Rust toolchain matching rust-toolchain.toml
        rustToolchain = pkgs.rust-bin.stable."1.95.0".default.override {
          extensions = [ "rustfmt" "clippy" "rust-src" ];
          targets = [
            "aarch64-apple-darwin"
            "x86_64-apple-darwin"
            "x86_64-unknown-linux-gnu"
            "aarch64-unknown-linux-gnu"
          ];
        };

        # Crane for Rust workspace builds
        craneLib = (crane.mkLib pkgs).overrideToolchain rustToolchain;

        # Common build args for the Cargo workspace
        commonArgs = {
          src = craneLib.cleanCargoSource ./.;
          buildInputs = pkgs.lib.optionals pkgs.stdenv.isDarwin (
            with pkgs.darwin.apple_sdk.frameworks;
            [ CoreFoundation Security SystemConfiguration ]
          );
        };

        # Cargo artifacts from the workspace (for incremental builds)
        cargoArtifacts = craneLib.buildDepsOnly (commonArgs // {
          pname = "vibe-workspace-deps";
        });

        # The full Rust workspace build
        vibeWorkspace = craneLib.buildPackage (commonArgs // {
          pname = "vibe-workspace";
          inherit cargoArtifacts;
          doCheck = false;
        });

        # Pre-commit check
        pre-commit-check = pre-commit-hooks.lib.${system}.run {
          src = ./.;
          hooks = {
            biome.enable = true;
            commitlint.enable = true;
          };
        };
      in
      {
        # ── Packages ──────────────────────────────────────
        packages = {
          default = vibeWorkspace;

          # The napi addon (release build)
          vibe-napi = craneLib.buildPackage (commonArgs // {
            pname = "vibe_napi";
            inherit cargoArtifacts;
            cargoExtraArgs = "-p vibe_napi --release";
            doCheck = false;
          });
        };

        # ── Development shells ────────────────────────────
        devShells = {
          default = pkgs.mkShell {
            name = "vibe-dev";
            buildInputs = with pkgs; [
              rustToolchain
              bun
              nodejs_22
              biome
              pre-commit
              jq
              git
            ];

            shellHook = ''
              echo "🟢 Vibe dev environment"
              echo "   Rust:  $(rustc --version)"
              echo "   Bun:   $(bun --version)"
              echo "   Node:  $(node --version)"
              export VIBE_ROOT="$PWD"
              if [ ! -d "node_modules" ]; then
                echo "→ Installing bun dependencies..."
                bun install --frozen-lockfile 2>/dev/null || true
              fi
            '';

            # Inherit the pre-commit check
            inherit (pre-commit-check) shellHook;
          };

          ci = pkgs.mkShell {
            name = "vibe-ci";
            buildInputs = with pkgs; [ rustToolchain bun nodejs_22 ];
            shellHook = ''
              export CI=true
              export VIBE_ROOT="$PWD"
            '';
          };

          ci-rust = pkgs.mkShell {
            name = "vibe-ci-rust";
            buildInputs = with pkgs; [ rustToolchain bun nodejs_22 ];
            shellHook = ''
              export CI=true
            '';
          };
        };

        # ── Checks ─────────────────────────────────────────
        checks = {
          rust-fmt = craneLib.cargoFmt (commonArgs // {
            pname = "vibe-fmt-check";
          });
          rust-clippy = craneLib.cargoClippy (commonArgs // {
            pname = "vibe-clippy-check";
            inherit cargoArtifacts;
            cargoClippyExtraArgs = "--all-targets -- -D warnings";
          });
          rust-test = craneLib.cargoTest (commonArgs // {
            pname = "vibe-test";
            inherit cargoArtifacts;
          });
          rust-bench = craneLib.cargoBench (commonArgs // {
            pname = "vibe-bench-check";
            inherit cargoArtifacts;
            cargoBenchExtraArgs = "--no-run";
          });
          vibe-napi-build = craneLib.buildPackage (commonArgs // {
            pname = "vibe-napi-build-check";
            inherit cargoArtifacts;
            cargoExtraArgs = "-p vibe_napi --release";
            doCheck = false;
          });
          pre-commit = pre-commit-check;
        };

        # ── Formatter ─────────────────────────────────────
        formatter = pkgs.nixfmt-rfc-style;
      }
    );
}
```

### 9.2 .envrc for direnv

```bash
# .envrc — load via: direnv allow
use flake
```

**Add to `.gitignore`**: `.envrc` should be in `.gitignore` (it's personal; add `use flake` to `CONTRIBUTING.md` instead).

---

## 10. File Change Summary

### Files to create

| File | Purpose |
|---|---|
| `flake.nix` | Main flake entry point |
| `nix/README.md` | Nix usage documentation |
| `nix/toolchains/rust.nix` | Rust toolchain configuration (optional, can inline in flake.nix) |
| `nix/toolchains/bun.nix` | Bun derivation (if nixpkgs version mismatches) |
| `nix/devshells/default.nix` | DevShell definition (optional, can inline) |
| `nix/devshells/ci.nix` | CI shell definition |
| `nix/packages/vibe-napi.nix` | Napi addon cross-build derivation |

### Files to modify

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | Replace setup-bun/setup-node/rustup with Nix installer |
| `.github/workflows/release-binaries.yml` | (Optional) add Nix-based cross-build step |
| `.gitignore` | Add `.envrc` (if recommended), `.direnv/`, `result` |
| `CONTRIBUTING.md` | Add Nix setup section alongside existing instructions |
| `docs/contributing/00-contributing.md` | Add Nix step to development setup |

### Files to leave unchanged

| File | Rationale |
|---|---|
| `package.json` | Bun package manager remains primary |
| `turbo.json` | Turborepo remains build orchestrator |
| `Cargo.toml` + all crate manifests | Cargo remains the Rust build system |
| `biome.json` | Biome config is tool-specific |
| `commitlint.config.js` | Commitlint config is tool-specific |
| `.pre-commit-config.yaml` | Can remain as fallback; pre-commit-hooks.nix replaces it in Nix shell |
| `.changeset/` | Changesets remain the release workflow |
| `renovate.json` | Renovate handles JS dependency updates |
| `homebrew/` | Homebrew formula is for end-user install, unrelated |

---

## 11. Validation Criteria

Every phase must pass these checks before proceeding to the next.

### Phase 0 (Foundation)

- [ ] `nix flake check` passes (may have few checks initially)
- [ ] `nix develop --command rustc --version` prints `1.95.0`
- [ ] `nix develop --command bun --version` prints `1.3.3`
- [ ] `nix develop --command node --version` prints `22.x`

### Phase 1 (Rust toolchain)

- [ ] `nix develop --command cargo build --workspace` succeeds
- [ ] `nix develop --command cargo test --workspace` passes all tests
- [ ] `nix develop --command cargo clippy --workspace --all-targets -- -D warnings` passes cleanly
- [ ] `nix develop --command cargo build -p vibe_napi --release` produces `target/release/libvibe_napi.{so,dylib}`

### Phase 2 (DevShell)

- [ ] `nix develop` drops into shell with all tools on PATH
- [ ] `bun install --frozen-lockfile` succeeds inside devShell
- [ ] `bun run build` succeeds inside devShell
- [ ] `bun run test` passes inside devShell
- [ ] `nix develop .#ci` drops into minimal shell with only build tools

### Phase 3 (CI)

- [ ] CI workflow (ci.yml) with Nix passes on a test PR
- [ ] CI build time is not significantly worse than current setup
- [ ] Rust CI runs with Nix produce identical artifacts to `rustup`-based runs
- [ ] Cache hit rates are acceptable (magic-nix-cache or cachix)

### Phase 4 (Checks)

- [ ] `nix flake check` runs all checks and passes
- [ ] Individual checks can be built: `nix build .#checks.x86_64-linux.rust-test`
- [ ] `nix build .#vibe-napi` produces the napi addon

### Phase 5 (Cross-compilation, optional)

- [ ] `nix build .#vibe-napi.aarch64-darwin` produces a functioning `.dylib`
- [ ] SHA256 of Nix-built artifact matches CI-built artifact (same source + same flags)
- [ ] Cross-compiled `.node` loads correctly in Node.js

### Phase 6 (Docs)

- [ ] `CONTRIBUTING.md` Nix section is clear and accurate
- [ ] New contributor can clone repo, run `nix develop`, and be productive in ~5 minutes

---

## 12. Potential Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Bun version mismatch** nixpkgs bun differs from pinned 1.3.3 | Lockfile incompatibility, CI failures | Fallback to fetching bun binary directly; pin exact version |
| **Rust 1.95 not in rust-overlay** (overlay may lag) | Cannot provide exact toolchain | Use `rust-bin.fromRustupToolchainFile` with `rust-toolchain.toml` |
| **CI time regression** Nix evaluation + install adds 30-60s to each job | Slower CI feedback | Use `magic-nix-cache` for store hits; run Nix and non-Nix concurrently during migration |
| **macOS nix-daemon not installed** Developers without Nix on Mac | Shell error on `nix develop` | Keep non-Nix setup instructions; `.envrc` is opt-in |
| **Crane workspace build times** First build of full workspace is slow | Poor DX on first `nix develop` | Use Crane's `buildDepsOnly` for incremental artifact reuse; Cachix cache for team |
| **pre-commit-hooks.nix conflicts** with existing `.pre-commit-config.yaml` | Double hook runs or confusion | In Nix shell, the Nix-managed hooks take precedence; `.pre-commit-config.yaml` remains for non-Nix users |
| **napi cross-compilation** macOS → Linux cross-build requires specialized toolchains | Failed builds | Target only platforms where cross-compilation is well-supported; keep non-Nix CI builders as safety net |
| **Contributor learning curve** Team unfamiliar with Nix | Low adoption | Make Nix optional; provide clear docs and `direnv` setup for seamless experience |

---

## 13. Maintenance Guidelines

### Updating the Rust version

When `rust-toolchain.toml` changes:

1. Update the version in `rust-bin.stable."<version>"` in `flake.nix`
2. Run `nix flake lock --update-input rust-overlay` to refresh the overlay
3. Verify with `nix develop --command rustc --version`

### Updating Bun version

When `package.json`'s `packageManager` field changes:

1. If using `pkgs.bun` from nixpkgs: update the nixpkgs input (`nix flake lock --update-input nixpkgs`)
2. If using a fetch derivation: update the version and hash in `nix/toolchains/bun.nix`
3. Verify with `nix develop --command bun --version`

### Updating the lockfile

```bash
# Update all inputs
nix flake update

# Update a single input
nix flake lock --update-input nixpkgs
nix flake lock --update-input rust-overlay

# Rebuild after lockfile changes
nix develop --rebuild
```

### Garbage collection

```bash
# Remove old devShell generations
nix-collect-garbage

# For nix-darwin users (recommended)
nix-darwin --extra-experimental-features "nix-command flakes"
```

---

## 14. Open Questions

1. **Should Nix replace or supplement the Docker build?** Currently Docker is used for production agent deployments (`docker/Dockerfile`). Nix could produce an OCI image via `pkgs.dockerTools`, but this would duplicate the `oven/bun` base image approach. **Recommendation**: Keep Docker as-is; do not replace with Nix for production images.

2. **Should the release workflow (release-binaries.yml) use Nix cross-compilation?** Nix makes cross-compilation more hermetic, but requires maintaining the napi cross-build derivation. The current per-platform GitHub Actions runners are simpler and well-understood. **Recommendation**: Implement cross-build derivations in Phase 5 as optional; keep Actions runners as the primary release path.

3. **Should we set up a Cachix cache from day one?** Rust crate compilation is the slowest part of the dev loop. A shared binary cache dramatically helps. **Recommendation**: Set up `vybe.cachix.org` during Phase 1, before team members start using Nix.

4. **What about Windows development?** Nix on Windows is experimental (WSL2-based). The vibe project has Windows as a release target only. **Recommendation**: Do not support Windows Nix development.

---

## Appendix A: Quick Reference — Common Commands

```bash
# Enter development environment
nix develop

# Enter CI environment
nix develop .#ci

# Build the Rust workspace
nix build .#default

# Build the napi addon
nix build .#vibe-napi

# Run all checks
nix flake check

# Run a specific check
nix build .#checks.x86_64-linux.rust-test

# Format all Nix files
nix fmt

# Update all dependencies
nix flake update
```

## Appendix B: Comparison — With vs Without Nix

| Aspect | Without Nix | With Nix |
|---|---|---|
| Rust setup | `rustup show` (auto-installs) | `nix develop` (pre-installed) |
| Bun setup | `curl https://bun.sh/install \| bash` | Included in devShell |
| Node setup | Manual install via nvm/brew | Included in devShell |
| Tool version consistency | Relies on rustup + bun version managers | Single source of truth (flake.lock) |
| CI Rust caching | Swatinem/rust-cache (cargo registry) | Crane + Cachix (full build artifacts) |
| CI tool setup | 3 separate actions (setup-bun, setup-node, rustup) | 1 action (nix-installer) |
| Cross-compilation | Per-platform CI runners | Nix pkgsCross infrastructure |
| Learning curve | Standard tooling | Must learn Nix DSL |
| First build time | ~30s (tool download) | ~60s (Nix eval + install) |
| Incremental builds | cargo handles incrementally | Crane + Cachix for binary cache |
