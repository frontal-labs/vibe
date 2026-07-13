# vibe_tokenizer

Native token counting for Vibe's context-window budgeting. A pure Rust library
(`#![forbid(unsafe_code)]`) exposed to JavaScript through the `vibe_napi` addon and consumed
by `@vibe/memory`'s request builder.

## Why

The agent loop trims the oldest turns to keep a request under the model's context window. The
pure-TS fallback estimates ~4 chars/token — cheap but inaccurate, so it either drops context
too early or overflows the provider (a 400). This crate returns a real BPE count and, crucially,
**per-message** counts so the caller trims in O(n) instead of re-counting the whole transcript
on every dropped turn.

## API

- `count_text(text, family) -> u32`
- `count_messages(messages_json, family) -> Vec<u32>` — per-message counts aligned with the
  input array; the system prompt is counted separately with `count_text`.

`family` is one of `openai` (`o200k_base`), `anthropic` (approximated with `o200k_base` —
Anthropic publishes no tokenizer, but this tracks far closer than a flat ratio), `cl100k`, or
`heuristic` (the flat ~4 chars/token fallback, identical to the TS path).

The framework works without this crate: when the native addon is absent, `@vibe/memory` uses its
TypeScript `estimateTokens` fallback.
