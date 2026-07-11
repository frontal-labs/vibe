//! WASM bindings (wasm-bindgen) for the in-browser Vibe playground.
//!
//! The `#[wasm_bindgen]` surface is behind the `wasm` feature so the default (host)
//! workspace build/test doesn't pull wasm-only linkage. Build the browser module
//! for `wasm32-unknown-unknown` with the `wasm` feature, then run `wasm-bindgen`.
//! FFI crate — does not `#![forbid(unsafe_code)]`.
//! See `docs/language/05-rust-implementation.md` (distribution).

/// The compiler version (also exported to JS).
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// The `#[wasm_bindgen]` surface (feature `wasm`): `compile`, `check`, `version`.
#[cfg(feature = "wasm")]
mod wasm_binding {
    use wasm_bindgen::prelude::wasm_bindgen;

    #[wasm_bindgen]
    pub fn compile(src: &str) -> String {
        vibe_compiler::compile_json(src)
    }

    #[wasm_bindgen]
    pub fn check(src: &str) -> String {
        vibe_compiler::check_json(src)
    }

    #[wasm_bindgen]
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
