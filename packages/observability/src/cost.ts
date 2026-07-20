import { MODEL_CATALOG, type TokenUsage } from "vibe/model"

export interface CostBreakdown {
  readonly inputUsd: number
  readonly outputUsd: number
  readonly totalUsd: number
}

/**
 * Price a run's token usage in USD from the model catalog. Cache read/write tokens
 * are billed at the input rate (a close approximation); unknown models cost 0.
 */
export function costOf(usage: TokenUsage, model: string): CostBreakdown {
  const rate = (MODEL_CATALOG as Record<string, { input: number; output: number }>)[model] ?? {
    input: 0,
    output: 0,
  }
  const inputTokens =
    usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
  const inputUsd = (inputTokens / 1_000_000) * rate.input
  const outputUsd = (usage.outputTokens / 1_000_000) * rate.output
  return { inputUsd, outputUsd, totalUsd: inputUsd + outputUsd }
}
