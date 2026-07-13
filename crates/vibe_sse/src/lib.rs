//! Native SSE frame splitting + OpenAI streaming fold — the Rust analogue of
//! `packages/model/src/openai/stream.ts`.
//!
//! OpenAI's `chat/completions` stream sends `data: {json}` frames separated by blank lines and
//! terminated by `data: [DONE]`. It streams tool calls piecewise (by `index`), so name and
//! argument fragments must be concatenated before parsing. This crate folds a full response body
//! into ordered text deltas plus a final normalized [`ModelResponse`], keeping the per-chunk
//! `JSON.parse` and string concatenation off the JS heap. The framework works without it: the TS
//! `createOpenAIStreamAccumulator` fallback produces identical output.
#![forbid(unsafe_code)]

use serde::{Deserialize, Serialize};

/// One `data:` frame from the stream (only the fields we read).
#[derive(Debug, Deserialize)]
struct StreamChunk {
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    choices: Vec<Choice>,
    #[serde(default)]
    usage: Option<Usage>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    #[serde(default)]
    delta: Option<Delta>,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Delta {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    tool_calls: Vec<ToolCallDelta>,
}

#[derive(Debug, Deserialize)]
struct ToolCallDelta {
    index: usize,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    function: Option<FunctionDelta>,
}

#[derive(Debug, Deserialize)]
struct FunctionDelta {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    arguments: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct Usage {
    #[serde(default)]
    prompt_tokens: Option<u32>,
    #[serde(default)]
    completion_tokens: Option<u32>,
}

/// A streamed event to yield (only text deltas surface mid-stream; tool calls arrive whole in the
/// final response). Serializes to the TS `ModelStreamEvent` text variant.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "camelCase")]
enum StreamEvent {
    Text { delta: String },
}

/// A normalized content block (`ContentBlock` in TS).
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum ContentBlock {
    Text {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
}

#[derive(Debug, Serialize)]
struct TokenUsage {
    #[serde(rename = "inputTokens")]
    input_tokens: u32,
    #[serde(rename = "outputTokens")]
    output_tokens: u32,
}

/// The final normalized response (`ModelResponse` in TS).
#[derive(Debug, Serialize)]
struct ModelResponse {
    content: Vec<ContentBlock>,
    #[serde(rename = "stopReason")]
    stop_reason: String,
    usage: TokenUsage,
    model: String,
}

/// The fold result handed back to JS: the ordered text events plus the final response.
#[derive(Debug, Serialize)]
pub struct FoldResult {
    events: Vec<StreamEvent>,
    response: ModelResponse,
}

/// Map an OpenAI `finish_reason` to a Vibe `StopReason`, matching `map-response.ts`.
fn stop_reason(finish: Option<&str>) -> &'static str {
    match finish.unwrap_or("stop") {
        "tool_calls" | "function_call" => "tool_use",
        "length" => "max_tokens",
        "content_filter" => "refusal",
        _ => "end_turn",
    }
}

/// Parse a tool-call `arguments` string, tolerating empty/malformed payloads (→ `{}`), matching
/// `parseArguments` in `map-response.ts`.
fn parse_arguments(raw: &str) -> serde_json::Value {
    if raw.is_empty() {
        return serde_json::json!({});
    }
    serde_json::from_str(raw).unwrap_or_else(|_| serde_json::json!({}))
}

#[derive(Default)]
struct ToolSlot {
    id: String,
    name: String,
    args: String,
}

/// Split an SSE body into decoded JSON payloads: frames separated by blank lines, each `data:`
/// line stripped of its prefix, with `[DONE]` and comments dropped.
fn data_payloads(body: &str) -> impl Iterator<Item = &str> {
    body.lines().filter_map(|line| {
        let line = line.trim_end_matches('\r');
        let rest = line.strip_prefix("data:")?;
        let rest = rest.strip_prefix(' ').unwrap_or(rest);
        if rest.is_empty() || rest == "[DONE]" {
            return None;
        }
        Some(rest)
    })
}

/// Fold a complete OpenAI SSE response body into ordered text deltas and a final response.
pub fn fold(body: &str) -> FoldResult {
    let mut model = String::new();
    let mut text = String::new();
    let mut finish: Option<String> = None;
    let mut usage = TokenUsage {
        input_tokens: 0,
        output_tokens: 0,
    };
    let mut slots: Vec<ToolSlot> = Vec::new();
    let mut events: Vec<StreamEvent> = Vec::new();

    for payload in data_payloads(body) {
        let Ok(chunk) = serde_json::from_str::<StreamChunk>(payload) else {
            continue; // skip a malformed frame rather than abort the whole stream
        };
        if let Some(m) = chunk.model {
            model = m;
        }
        if let Some(u) = chunk.usage {
            if let Some(p) = u.prompt_tokens {
                usage.input_tokens = p;
            }
            if let Some(c) = u.completion_tokens {
                usage.output_tokens = c;
            }
        }
        let Some(choice) = chunk.choices.into_iter().next() else {
            continue;
        };
        if let Some(reason) = choice.finish_reason {
            finish = Some(reason);
        }
        let Some(delta) = choice.delta else {
            continue;
        };
        if let Some(content) = delta.content {
            if !content.is_empty() {
                text.push_str(&content);
                events.push(StreamEvent::Text { delta: content });
            }
        }
        for call in delta.tool_calls {
            if slots.len() <= call.index {
                slots.resize_with(call.index + 1, ToolSlot::default);
            }
            let slot = &mut slots[call.index];
            if let Some(id) = call.id {
                slot.id = id;
            }
            if let Some(func) = call.function {
                if let Some(name) = func.name {
                    slot.name.push_str(&name);
                }
                if let Some(args) = func.arguments {
                    slot.args.push_str(&args);
                }
            }
        }
    }

    let mut content: Vec<ContentBlock> = Vec::new();
    if !text.is_empty() {
        content.push(ContentBlock::Text { text });
    }
    for slot in &slots {
        content.push(ContentBlock::ToolUse {
            id: slot.id.clone(),
            name: slot.name.clone(),
            input: parse_arguments(&slot.args),
        });
    }

    FoldResult {
        events,
        response: ModelResponse {
            content,
            stop_reason: stop_reason(finish.as_deref()).to_string(),
            usage,
            model,
        },
    }
}

/// Fold an SSE body and serialize the result to JSON for the napi boundary.
pub fn fold_json(body: &str) -> String {
    serde_json::to_string(&fold(body)).unwrap_or_else(|_| "{}".to_string())
}

#[cfg(test)]
mod tests;
