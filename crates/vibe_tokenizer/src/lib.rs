//! Accurate, native token counting for the agent loop's context-window budgeting.
//!
//! `@vibe/memory`'s request builder trims the oldest turns to fit a token budget. Its
//! pure-TS fallback estimates ~4 chars/token — cheap but inaccurate, which either drops
//! context too early or overflows the provider (a 400). This crate gives a real BPE count
//! (via `tiktoken-rs`) so trimming is correct, and returns **per-message** counts so the
//! caller can trim in O(n) instead of re-counting the whole transcript each drop.
#![forbid(unsafe_code)]

use std::sync::OnceLock;

use serde::Deserialize;
use tiktoken_rs::{cl100k_base, o200k_base, CoreBPE};

/// Which tokenizer to approximate a model family with.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Family {
    /// OpenAI GPT-4o / o-series — `o200k_base`.
    OpenAi,
    /// Anthropic Claude — no public tokenizer; approximated with `o200k_base`, which
    /// tracks Claude's counts far closer than a flat chars/token ratio.
    Anthropic,
    /// Legacy OpenAI (`cl100k_base`).
    Cl100k,
    /// No BPE: a flat ~4 chars/token heuristic. Matches the TS fallback exactly.
    Heuristic,
}

impl Family {
    /// Parse the family string passed from JS (`"openai" | "anthropic" | ...`).
    /// Unknown values fall back to the heuristic rather than erroring.
    pub fn parse(name: &str) -> Self {
        match name {
            "openai" => Self::OpenAi,
            "anthropic" => Self::Anthropic,
            "cl100k" => Self::Cl100k,
            _ => Self::Heuristic,
        }
    }
}

const CHARS_PER_TOKEN: usize = 4;
/// Per-message framing overhead (role + delimiters), mirroring OpenAI's counting guide.
const MESSAGE_OVERHEAD: usize = 4;
/// Flat cost charged for a non-text content block that carries no `text` field.
const NON_TEXT_BLOCK: usize = 32;

fn bpe_for(family: Family) -> Option<&'static CoreBPE> {
    match family {
        Family::OpenAi | Family::Anthropic => {
            static BPE: OnceLock<Option<CoreBPE>> = OnceLock::new();
            BPE.get_or_init(|| o200k_base().ok()).as_ref()
        }
        Family::Cl100k => {
            static BPE: OnceLock<Option<CoreBPE>> = OnceLock::new();
            BPE.get_or_init(|| cl100k_base().ok()).as_ref()
        }
        Family::Heuristic => None,
    }
}

/// Count the tokens in a plain string for `family`. Falls back to the char heuristic if
/// the BPE vocab can't be loaded, so this never fails.
pub fn count_text(text: &str, family: Family) -> u32 {
    match bpe_for(family) {
        Some(bpe) => bpe.encode_with_special_tokens(text).len() as u32,
        None => heuristic(text) as u32,
    }
}

fn heuristic(text: &str) -> usize {
    text.len().div_ceil(CHARS_PER_TOKEN)
}

/// A Vibe message: `{ role, content }` where content is a string or a block array.
#[derive(Debug, Deserialize)]
struct Message {
    #[serde(default)]
    content: Content,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum Content {
    Text(String),
    Blocks(Vec<Block>),
}

impl Default for Content {
    fn default() -> Self {
        Content::Text(String::new())
    }
}

/// A content block. Only the fields that carry countable text are modeled; everything
/// else (tool ids, flags) is ignored and absorbed by the flat `NON_TEXT_BLOCK` cost.
#[derive(Debug, Deserialize)]
struct Block {
    #[serde(default)]
    text: Option<String>,
    /// `toolResult` blocks carry their payload under `content`, not `text`.
    #[serde(default)]
    content: Option<String>,
    /// `toolUse` blocks carry a tool name and a JSON `input` object.
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    input: Option<serde_json::Value>,
}

fn count_block(block: &Block, family: Family) -> u32 {
    if let Some(text) = &block.text {
        return count_text(text, family);
    }
    let mut tokens = NON_TEXT_BLOCK as u32;
    if let Some(content) = &block.content {
        tokens += count_text(content, family);
    }
    if let Some(name) = &block.name {
        tokens += count_text(name, family);
    }
    if let Some(input) = &block.input {
        tokens += count_text(&input.to_string(), family);
    }
    tokens
}

fn count_message(message: &Message, family: Family) -> u32 {
    let body = match &message.content {
        Content::Text(text) => count_text(text, family),
        Content::Blocks(blocks) => blocks.iter().map(|b| count_block(b, family)).sum(),
    };
    body + MESSAGE_OVERHEAD as u32
}

/// Count each message in a JSON array, returning a per-message token count aligned with the
/// input order. The system prompt is counted separately via [`count_text`]. Returns an empty
/// vec if the JSON doesn't parse as a message array (the caller then uses the TS fallback).
pub fn count_messages(messages_json: &str, family: Family) -> Vec<u32> {
    let Ok(messages) = serde_json::from_str::<Vec<Message>>(messages_json) else {
        return Vec::new();
    };
    messages.iter().map(|m| count_message(m, family)).collect()
}

#[cfg(test)]
mod tests;
