import type { TokenUsage } from "vibe/model"

/** USD per 1M tokens, by model id. Cached snapshot; override via `estimateCost`. */
export const MODEL_PRICING: Readonly<Record<string, { input: number; output: number }>> = {
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
}

export interface CostBreakdown {
  readonly inputUsd: number
  readonly outputUsd: number
  readonly totalUsd: number
}

/**
 * Estimate the USD cost of a run from its token usage. Cache reads/writes are
 * priced at the input rate (a close approximation). Unknown models cost 0 — pass a
 * `pricing` override for models not in `MODEL_PRICING`.
 */
export function estimateCost(
  usage: TokenUsage,
  model: string,
  pricing: Record<string, { input: number; output: number }> = MODEL_PRICING,
): CostBreakdown {
  const rate = pricing[model] ?? { input: 0, output: 0 }
  const inputTokens =
    usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
  const inputUsd = (inputTokens / 1_000_000) * rate.input
  const outputUsd = (usage.outputTokens / 1_000_000) * rate.output
  return { inputUsd, outputUsd, totalUsd: inputUsd + outputUsd }
}
