//! Node bindings (napi-rs) exposing the Vibe compiler to JavaScript in-process.
//!
//! The `#[napi]` surface is behind the `node` feature so the default build doesn't
//! link Node's N-API symbols (keeps `cargo test --workspace` and CI green). Build
//! the addon with `cargo build -p vibe_napi --features node --release`. FFI crate —
//! does **not** `#![forbid(unsafe_code)]`. See `docs/language/05-rust-implementation.md`.

/// The compiler version (also exported to JS).
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// The `#[napi]` surface (feature `node`): `compile`, `check`, `version`.
#[cfg(feature = "node")]
mod node_binding {
    use napi_derive::napi;

    #[napi]
    pub fn compile(src: String) -> String {
        vibe_compiler::compile_json(&src)
    }

    #[napi]
    pub fn check(src: String) -> String {
        vibe_compiler::check_json(&src)
    }

    #[napi]
    pub fn version() -> String {
        super::version().to_string()
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn version_is_nonempty() {
        assert!(!super::version().is_empty());
    }
}
