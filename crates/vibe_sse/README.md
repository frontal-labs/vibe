# vibe_sse

Native SSE frame splitting and OpenAI streaming fold — the Rust analogue of
`packages/model/src/openai/stream.ts`. A pure Rust library (`#![forbid(unsafe_code)]`) exposed to
JavaScript through the `vibe_napi` addon and consumed by `@vibe/model`'s OpenAI provider.

## Why

OpenAI streams `chat/completions` as `data: {json}` frames and delivers tool calls piecewise (by
`index`), so name/argument fragments must be concatenated and parsed. Folding a whole response
body in Rust keeps the per-chunk `JSON.parse` and string building off the JS heap on high-throughput
streams.

## API

- `fold(body) -> FoldResult` — ordered text deltas plus the final normalized `ModelResponse`.
- `fold_json(body) -> String` — the same, serialized to JSON for the napi boundary. Output matches
  the TS `ModelStreamEvent` / `ModelResponse` shapes exactly (including the `finish_reason` →
  `stopReason` mapping and lenient tool-argument parsing).

The framework works without this crate: `@vibe/model`'s `createOpenAIStreamAccumulator` fallback
produces identical output when the native addon is absent.
