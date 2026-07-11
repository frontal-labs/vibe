---
title: "Model Spec"
description: "The contract for `@vibe/model` and the exact Anthropic API rules the reference"
---

# Model Spec

The contract for `@vibe/model` and the exact Anthropic API rules the reference
provider must honor. This is the authoritative reference for anyone implementing or
reviewing a provider. Companion: [Model & provider layer](../architecture/10-model-provider-layer.md).

## Model catalog (defaults)

| Role | Model id | Context | Notes |
|---|---|---|---|
| **Default** | `claude-opus-4-8` | 1M | Most capable Opus-tier; long-horizon agentic + knowledge work. |
| Balanced | `claude-sonnet-4-6` | 1M | Speed/intelligence balance for routine agents. |
| Cheap / fan-out | `claude-haiku-4-5` | 200K | Sub-agents, parallel scoring, simple tasks. |
| Hardest runs | `claude-fable-5` | 1M | Most capable widely-released model; long-horizon. Extra rules — see below. |

Use the exact id strings — never append date suffixes to aliases. Model selection
is per-agent and per-sub-agent; the default agent uses `claude-opus-4-8`.

## Request options → Anthropic params

| Vibe option | Anthropic param | Rule |
|---|---|---|
| `model` | `model` | Exact id string. |
| `system` | `system` | Optional. Keep frozen for prompt-cache stability. |
| `messages` | `messages` | First message `user`; roles as sent. |
| `tools` | `tools` | JSON Schemas from `@vibe/tools`. |
| `toolChoice` | `tool_choice` | `auto` \| `any` \| `{type:"tool",name}` \| `none`. |
| `maxTokens` | `max_tokens` | Default ~16000 non-streaming; up to 128K streaming. |
| `thinking` | `thinking` | **Default `{ type: "adaptive" }`.** See rules below. |
| `effort` | `output_config.effort` | `low`\|`medium`\|`high`\|`xhigh`\|`max`. Default `high`. |
| `stream` | (streaming API) | Auto-on for large `maxTokens`. |

## API drift you MUST respect

These are the current-model rules. Getting them wrong is a 400, not a warning.

1. **No `budget_tokens`.** `thinking: { type: "enabled", budget_tokens: N }` returns
   **400** on Opus 4.7/4.8 and Fable 5. Use `thinking: { type: "adaptive" }` and
   control depth with `effort`.
2. **No sampling params.** `temperature`, `top_p`, `top_k` are removed on current
   models and **400**. Steer via prompt + effort. Do not set them.
3. **Adaptive is not implicit.** Omitting `thinking` runs *without* thinking on
   Opus 4.7/4.8. Set `{ type: "adaptive" }` explicitly to enable it. On Fable 5,
   thinking is always on — omit the param; an explicit `{ type: "disabled" }` 400s.
4. **Thinking display defaults to omitted.** On Opus 4.7/4.8 and Fable 5, thinking
   blocks stream with empty text unless you set `display: "summarized"`. If the loop
   surfaces reasoning to a UI, set it; otherwise leave default.
5. **Stream large outputs.** `max_tokens > ~16000` must use streaming
   (`.stream(...).finalMessage()`) to avoid SDK HTTP timeouts.
6. **No last-assistant prefill.** Prefilling the final assistant turn 400s on
   current models. Use structured outputs (`output_config.format`) or a system
   instruction instead.
7. **Parse tool-call inputs as JSON.** Never raw-string-match a serialized
   `tool_use.input`; escaping varies. The provider returns parsed `input`.

## Stop-reason normalization

The provider maps Anthropic `stop_reason` → Vibe `StopReason`:

| Anthropic | Vibe `StopReason` | Loop action |
|---|---|---|
| `end_turn` | `end_turn` | Return text. |
| `tool_use` | `tool_use` | Execute tools, iterate. |
| `max_tokens` | `max_tokens` | Policy (continue / surface). |
| `refusal` | `refusal` | Surface `ModelRefusalError` / fallback. |
| `pause_turn` | `pause` | Re-send to resume (server-tool loops). |

## Refusals & fallbacks

- A `stop_reason: "refusal"` is a **successful HTTP 200** with empty (pre-output)
  or partial (mid-stream) content. **Check `stopReason` before reading content.**
- `stop_details.category` (e.g. `cyber`, `bio`) is informative; branch on
  `stopReason`, not on `stop_details` (which can be `null`).
- **Fallbacks are opt-in.** New provider code ships with the server-side
  `fallbacks` parameter by default so a refusal is transparently re-served by
  `claude-opus-4-8` in the same call (beta header `server-side-fallback-2026-06-01`;
  first-party API / Claude Platform on AWS). On platforms without it (Bedrock,
  Vertex, Foundry), use the SDK's client-side refusal-fallback middleware.
- Vibe surfaces refusals as a typed `ModelRefusalError` when no fallback is
  configured or the whole chain refuses.

## Errors (HTTP → `@vibe/errors`)

| Status / condition | Typed error | Retryable |
|---|---|---|
| 429 | `RateLimitError` | Yes (backoff; honor `retry-after`) |
| 529 | `OverloadedError` | Yes (backoff) |
| 500 | `InternalServerError` | Yes |
| 400 | `InvalidRequestError` | No |
| 401 | `AuthenticationError` | No |
| 403 | `PermissionError` | No |
| `stop_reason:"refusal"` | `ModelRefusalError` | Via fallback |

The runtime's `retry` retries the retryable set with jittered backoff and never
retries `CancelledError`/`AbortError` (already true in `@vibe/runtime`).

## Token usage

`ModelResponse.usage` normalizes `input_tokens`, `output_tokens`, and cache
fields. The agent loop aggregates usage across iterations and logs it. Prefer the
provider's `countTokens` over any client-side estimator — never `tiktoken`
(OpenAI's tokenizer; wrong for Claude).

## Prompt caching (guidance)

- Keep `system` and the tool list **stable and deterministic** (sorted) so the
  cached prefix survives across turns. Any byte change in the prefix invalidates
  the cache.
- Inject volatile context (timestamps, ids) late in `messages`, not in `system`.
- The provider may set `cache_control` breakpoints on the system/tool prefix.

## MCP & server tools (optional)

- MCP servers can be exposed as Vibe tools via the [tools MCP adapter](../architecture/11-tools-and-mcp.md);
  the provider passes them through as an `mcp_toolset` when using the MCP connector,
  or the tools layer bridges them as ordinary tools.
- Server-side tools (web search, code execution) are provider features declared in
  `tools`; the loop treats their results as content, honoring `pause_turn`.

## Provider capabilities table

| Capability | Anthropic reference | Interface requirement |
|---|---|---|
| `generate` | ✅ | Required |
| `stream` | ✅ | Required |
| `countTokens` | ✅ | Optional |
| Tool use | ✅ | Required (normalized `toolUse` blocks) |
| Adaptive thinking | ✅ default | Provider default |
| Fallbacks | ✅ opt-in default | Provider option |
| MCP | ✅ | Optional |
