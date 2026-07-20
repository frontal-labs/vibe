/**
 * The known models, with context windows and per-1M-token USD pricing. Used to
 * type `ModelId` (autocomplete) and to price runs (`vibe/devtools`). Includes a
 * snapshot of common OpenAI-compatible models for use with `createOpenAIProvider`.
 * A snapshot — custom/newer ids are still accepted via `ModelId`'s `(string & {})`.
 */
export const MODEL_CATALOG = {
  "claude-fable-5": { contextWindow: 1_000_000, input: 10, output: 50 },
  "claude-opus-4-8": { contextWindow: 1_000_000, input: 5, output: 25 },
  "claude-opus-4-7": { contextWindow: 1_000_000, input: 5, output: 25 },
  "claude-opus-4-6": { contextWindow: 1_000_000, input: 5, output: 25 },
  "claude-sonnet-4-6": { contextWindow: 1_000_000, input: 3, output: 15 },
  "claude-haiku-4-5": { contextWindow: 200_000, input: 1, output: 5 },
  "gpt-4.1": { contextWindow: 1_000_000, input: 2, output: 8 },
  "gpt-4.1-mini": { contextWindow: 1_000_000, input: 0.4, output: 1.6 },
  "gpt-4o": { contextWindow: 128_000, input: 2.5, output: 10 },
  "gpt-4o-mini": { contextWindow: 128_000, input: 0.15, output: 0.6 },
  o3: { contextWindow: 200_000, input: 2, output: 8 },
} as const

/** The literal union of catalog model ids. */
export type KnownModelId = keyof typeof MODEL_CATALOG

/** The known model ids as an array (for iteration / validation). */
export const KNOWN_MODEL_IDS = Object.keys(MODEL_CATALOG) as KnownModelId[]

/** Fallback context window for models not in the catalog. */
const DEFAULT_CONTEXT_WINDOW = 200_000

/** The context window (max total tokens) for a model, or a safe default for unknown ids. */
export function contextWindowFor(model: string): number {
  return MODEL_CATALOG[model as KnownModelId]?.contextWindow ?? DEFAULT_CONTEXT_WINDOW
}

/**
 * The tokenizer family to use when counting for a model (drives `vibe_tokenizer`). Anthropic
 * publishes no tokenizer, so those ids approximate with the OpenAI BPE; unknown ids use the
 * char heuristic so behavior matches the pure-TS path exactly.
 */
export function tokenFamilyFor(model: string): "openai" | "anthropic" | "heuristic" {
  if (model.startsWith("claude")) return "anthropic"
  if (model.startsWith("gpt") || model.startsWith("o1") || model.startsWith("o3")) return "openai"
  return "heuristic"
}

/**
 * Total USD cost of token `usage` for a model, from the catalog's per-1M rates. Cache tokens are
 * priced at the input rate; unknown models cost 0. Lives here (not `vibe/devtools`) so the agent
 * loop can enforce a cost ceiling without depending up the graph.
 */
export function priceUsd(
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  },
  model: string,
): number {
  const rate = MODEL_CATALOG[model as KnownModelId]
  if (!rate) return 0
  const inputTokens =
    usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
  return (inputTokens / 1_000_000) * rate.input + (usage.outputTokens / 1_000_000) * rate.output
}
