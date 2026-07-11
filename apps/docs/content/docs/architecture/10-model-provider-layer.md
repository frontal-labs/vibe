---
title: "Model & Provider Layer"
description: "The loop must not import a vendor SDK directly. It depends on a `ModelProvider`"
---

# Model & Provider Layer

> 🚧 Planned — package `@vibe/model`. The interface the [agent loop](./09-agent-loop.md)
> depends on, plus a reference Anthropic provider.

The loop must not import a vendor SDK directly. It depends on a `ModelProvider`
interface; providers adapt specific SDKs to it. This keeps the core
provider-agnostic while shipping correct Claude-first defaults.

## The interface

```ts
interface ModelProvider {
  readonly id: string                    // "anthropic"
  generate(request: ModelRequest): Promise<ModelResponse>
  stream(request: ModelRequest): AsyncIterable<ModelStreamEvent>
  countTokens?(request: ModelRequest): Promise<number>
}

interface ModelRequest {
  model: string                          // e.g. "claude-opus-4-8"
  system?: string
  messages: Message[]
  tools?: ToolSchema[]                   // model-facing JSON Schemas (from @vibe/tools)
  toolChoice?: ToolChoice
  maxTokens?: number
  thinking?: ThinkingConfig              // default: { type: "adaptive" }
  effort?: Effort                        // "low" | "medium" | "high" | "xhigh" | "max"
  stream?: boolean
}

interface ModelResponse {
  readonly content: ContentBlock[]       // text | thinking | toolUse blocks
  readonly stopReason: StopReason        // normalized enum (see below)
  readonly usage: TokenUsage
  readonly model: string
}

type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "pause"
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "toolUse"; id: string; name: string; input: unknown }

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}
```

The provider's job is to translate `ModelRequest` → the SDK's request shape and the
SDK's response → `ModelResponse`, **normalizing stop reasons and content blocks**
so the loop never sees provider-specific shapes.

## The Anthropic reference provider

Wraps `@anthropic-ai/sdk`. Defaults encode current best practice:

- **Default model:** `claude-opus-4-8`. Sub-agents may use `claude-haiku-4-5` for
  cheap/parallel work or `claude-sonnet-4-6` for balance. `claude-fable-5` is
  available for the hardest long-horizon runs.
- **Thinking:** `{ type: "adaptive" }` by default — the model decides when and how
  much to think, and interleaves thinking between tool calls automatically. There
  is **no `budget_tokens`** on current models (it 400s on Opus 4.7/4.8 and
  Fable 5); depth is controlled by `effort`.
- **Effort:** exposed as an option; default `high`. `xhigh` for coding/agentic
  work. Sweep per route.
- **Streaming:** used automatically for large `max_tokens` (≳16K) to avoid HTTP
  timeouts. `generate()` uses `stream()` + `finalMessage()` under the hood for big
  outputs.
- **Sampling params removed:** no `temperature`/`top_p`/`top_k` on current models
  (they 400). Steering is via prompt + effort.
- **Refusals:** a `stop_reason: "refusal"` returns HTTP 200 with empty/partial
  content. The provider normalizes it to `StopReason "refusal"` and surfaces the
  category; the loop can trigger a fallback model. New provider code ships with the
  server-side `fallbacks` opt-in by default (fallback target `claude-opus-4-8`).

See [Model spec](../specs/model-spec.md) for the full option → SDK-field mapping
and model catalog, and [claude-api reference facts](../specs/model-spec.md#api-drift-you-must-respect)
for the API-drift rules the provider must honor.

### Sketch

```ts
// @vibe/model — anthropic provider (illustrative)
import Anthropic from "@anthropic-ai/sdk"

export function createAnthropicProvider(opts: AnthropicOptions): ModelProvider {
  const client = new Anthropic({ apiKey: opts.apiKey })  // or env ANTHROPIC_API_KEY
  return {
    id: "anthropic",
    async generate(req) {
      const params = toAnthropicParams(req)              // maps thinking/effort/tools
      const large = (req.maxTokens ?? 16_000) > 16_000
      const msg = large
        ? await client.messages.stream(params).finalMessage()
        : await client.messages.create(params)
      return normalize(msg)                              // → ModelResponse
    },
    async *stream(req) {
      const s = client.messages.stream(toAnthropicParams(req))
      for await (const ev of s) yield normalizeEvent(ev) // → ModelStreamEvent
    },
    countTokens: (req) =>
      client.messages.countTokens(toCountParams(req)).then((r) => r.input_tokens),
  }
}
```

## Registration & DI

The provider is registered against a `ServiceToken<ModelProvider>` in the DI
container at system startup. The agent loop resolves it by token — so tests can
swap in a deterministic fake provider, and applications can register a different
vendor without touching the loop.

```ts
export const modelProviderToken = createToken<ModelProvider>("model.provider")
// at startup:
container.registerInstance(modelProviderToken, createAnthropicProvider({ ... }))
```

## Lifecycle & runtime integration

- The provider participates in the [lifecycle](./04-lifecycle.md): any warm-up
  (e.g. cache pre-warm, MCP connection) happens on `init`/`start`; teardown on
  `stop`.
- Every `generate`/`stream` call the loop makes is wrapped in a
  [runtime execution](./05-runtime-execution.md): retry on `RateLimitError` /
  `OverloadedError` with jittered backoff (the runtime's `retry` already knows not
  to retry `CancelledError`/`AbortError`), timeout, and cancellation.

## Multi-provider

Because the loop depends on the interface, supporting another vendor is:
1. Implement `ModelProvider` for that SDK.
2. Map its request/response and **normalize stop reasons** into Vibe's enum.
3. Register it against `modelProviderToken`.

The default and the fully-specified, tested reference is Anthropic. Other
providers are additive, never a rewrite. See [Positioning](../vision/01-positioning-and-landscape.md)
for why "provider-agnostic core, Claude-first defaults" is the right stance.
