---
"@vibe/shared": minor
"@vibe/memory": minor
"@vibe/model": minor
"@vibe/agent": minor
"@vibe/build": minor
"@vibe/config": minor
"@vibe/errors": minor
"@vibe/cli": minor
---

Native accelerators, correct context budgeting, run observability, and DX polish.

- **Native addon (Rust):** new `vibe_tokenizer` (accurate BPE token counting via `tiktoken-rs`)
  and `vibe_sse` (OpenAI SSE fold) crates, exposed through the existing `vibe_napi` addon. A shared
  `nativeAddon()` loader in `@vibe/shared` memoizes the optional addon; every native path keeps a
  pure-TS fallback, so the framework works unchanged without the addon.
- **Token budgeting (`@vibe/memory` + `@vibe/agent`):** the request builder now counts tokens
  accurately (native BPE when present) and trims in O(n) instead of O(n²); the agent loop actually
  applies a context budget (context window minus an output reserve), so long conversations are
  compacted instead of overflowing the provider. Adds a `middle-out` compaction strategy.
- **Observability (`@vibe/agent`):** `AgentResult.timings` reports per-iteration model vs tool
  wall-clock, a `timing` stream event is emitted, and `RunOptions.maxCostCents` enforces a hard
  cost ceiling.
- **DX:** incremental `vibe dev` via a warm esbuild context (`createDevBuilder`); actionable error
  hints (`withHint`, `agentsMissingError`, `formatDiagnostic`); and a config loader that transpiles
  `vibe.config.ts` with esbuild so it loads under plain Node, not only TS-aware runtimes.
