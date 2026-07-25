# vibe-tokenizer

Accurate, native token counting for the agent loop's context-window budgeting.

Uses `tiktoken-rs` (BPE) to count tokens per-message, enabling O(n) transcript trimming instead of re-counting the whole buffer each turn.

## Public API

| Function | Description |
|----------|-------------|
| `count_text(text: &str, family: Family) -> u32` | Count tokens in a plain string for a given model family |
| `count_messages(messages_json: &str, family: Family) -> Vec<u32>` | Per-message token counts for a JSON message array (aligned with input order) |

### Family

The `Family` enum selects which tokenizer to use:

| Variant | Tokenizer | Models |
|---------|-----------|--------|
| `OpenAi` | `o200k_base` | GPT-4o, o-series |
| `Anthropic` | `o200k_base` (best approximation) | Claude |
| `Cl100k` | `cl100k_base` | Legacy OpenAI |
| `Heuristic` | `~4 chars/token` | Unknown / fallback |

Created via `Family::parse(name)` where `name` is `"openai"`, `"anthropic"`, `"cl100k"`, or any other value (→ heuristic).

## Notes

- BPE vocab loads lazily (once per family, via `OnceLock`)
- Falls back to heuristic if the BPE vocab can't be loaded — never fails
- The heuristic matches the TS fallback exactly (`Math.ceil(text.length / 4)`)
- No `unsafe` code
