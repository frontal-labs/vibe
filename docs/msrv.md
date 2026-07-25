# Minimum Supported Rust Version (MSRV)

The current MSRV for the Vibe Rust crates is **1.95**.

## Policy
- The MSRV is set in `rust-toolchain.toml` (`channel = "1.95"`)
- CI runs `cargo test` and `cargo clippy` using the MSRV toolchain (via `rustup show` honoring rust-toolchain.toml)
- MSRV bumps should be:
  - Documented in changelog entries
  - Accompanied by rationale (new language feature, dependency requirement, etc.)
  - Approved via a PR that updates `rust-toolchain.toml` and CI configurations

## Crates
All crates in the workspace inherit:
- `edition = "2021"`
- `rust-version = "1.95"`

These are defined in `[workspace.package]` in `Cargo.toml` and each crate references them with `rust-version.workspace = true`.
