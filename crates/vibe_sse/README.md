# vibe-sse

Native SSE frame splitting and OpenAI streaming fold — the Rust analogue of `packages/model/src/openai/stream.ts`.

Folds a complete OpenAI `chat/completions` SSE response body into ordered text deltas plus a final normalized response, keeping per-chunk JSON parsing and string concatenation off the JS heap.

## Public API

| Function | Description |
|----------|-------------|
| `fold(body: &str) -> FoldResult` | Parses an SSE body and returns a `FoldResult` with ordered text events and the final response |
| `fold_json(body: &str) -> String` | Like `fold()` but serializes the result to JSON for the napi boundary |

### FoldResult

A struct with private fields — use `fold()` or `fold_json()` to obtain results. Internally contains:
- `events`: ordered text `StreamEvent` values (one per content delta)
- `response`: normalized `ModelResponse` with content blocks, stop reason, token usage, and model

## Details

- Strips `data:` prefixes and `[DONE]` terminators
- Concatenates piecewise tool call fragments (by `index`) before parsing
- Tolerates malformed frames — skips rather than aborting the stream
- No `unsafe` code

The TS `createOpenAIStreamAccumulator` fallback produces identical output; this crate is a performance accelerator.
