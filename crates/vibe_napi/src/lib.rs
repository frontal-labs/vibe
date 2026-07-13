//! Node bindings (napi-rs) exposing Vibe's native accelerators to JavaScript in-process:
//! `@vibe/build`'s agent→tool graph (`vibe_bundler`), context-window token counting
//! (`vibe_tokenizer`), and OpenAI SSE folding (`vibe_sse`).
//!
//! The `#[napi]` surface is behind the `node` feature so the default build doesn't
//! link Node's N-API symbols (keeps `cargo test --workspace` and CI green). Build
//! the addon with `cargo build -p vibe_napi --features node --release`. FFI crate —
//! does **not** `#![forbid(unsafe_code)]`.

/// The bundler version (also exported to JS).
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// The `#[napi]` surface (feature `node`): `tool_edges`, `count_text`, `count_messages`,
/// `sse_fold`, `version`.
#[cfg(feature = "node")]
mod node_binding {
    use napi_derive::napi;
    use vibe_tokenizer::Family;

    /// Extract an agent module's tool imports (specifier + local binding) as JSON.
    /// Powers `@vibe/build`'s agent→tool graph for code-splitting.
    #[napi]
    pub fn tool_edges(agent_source: String, tool_marker: String) -> String {
        vibe_bundler::tool_edges_json(&agent_source, &tool_marker)
    }

    /// Count the tokens in a string for a model `family` (`"openai" | "anthropic" |
    /// "cl100k" | "heuristic"`). Backs `@vibe/memory`'s token budgeting.
    #[napi]
    pub fn count_text(text: String, family: String) -> u32 {
        vibe_tokenizer::count_text(&text, Family::parse(&family))
    }

    /// Per-message token counts for a JSON message array (aligned with input order), so the
    /// caller can trim the oldest turns to a budget in O(n).
    #[napi]
    pub fn count_messages(messages_json: String, family: String) -> Vec<u32> {
        vibe_tokenizer::count_messages(&messages_json, Family::parse(&family))
    }

    /// Fold a complete OpenAI SSE response body into ordered text events + a final
    /// `ModelResponse`, returned as JSON. Backs `@vibe/model`'s OpenAI streaming path.
    #[napi]
    pub fn sse_fold(body: String) -> String {
        vibe_sse::fold_json(&body)
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
