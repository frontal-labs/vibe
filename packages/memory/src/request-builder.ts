import type { Effort, Message, ModelId, ModelRequest, ToolSchema } from "vibe/model"
import { nativeAddon } from "vibe/shared"

import type { Conversation } from "./types"

/** Estimate tokens for a message list. Default is ~4 chars/token — cheap and offline. */
export type TokenCounter = (messages: readonly Message[], system?: string) => number

/**
 * Which tokenizer the native addon approximates. Mirrors `vibe_tokenizer::Family`. `heuristic`
 * reproduces the TS `estimateTokens` fallback exactly, so passing it (or omitting a family) keeps
 * behavior identical whether or not the addon is loaded.
 */
export type TokenFamily = "openai" | "anthropic" | "cl100k" | "heuristic"

/**
 * How to shrink a transcript that exceeds the budget:
 * - `drop-oldest` (default): drop whole turns from the front, keeping the most recent suffix.
 * - `middle-out`: keep the first turn (it usually frames the task) plus the most recent suffix,
 *   dropping the middle — preserves both the setup and the live context.
 *
 * A summarizing strategy (replace dropped turns with a model-written summary) is a deliberate
 * async pre-pass over the conversation, not a mode here — `buildRequest` stays synchronous.
 */
export type CompactionStrategy = "drop-oldest" | "middle-out"

export interface BuildRequestOptions {
  model: ModelId
  conversation: Conversation
  /** Overrides the conversation's own system prompt. */
  system?: string
  tools?: ToolSchema[]
  effort?: Effort
  maxTokens?: number
  /** Max input tokens; when set, the oldest messages are dropped to fit. */
  budget?: number
  /** How to count tokens; defaults to the native addon if present, else a char heuristic. */
  countTokens?: TokenCounter
  /** Tokenizer family for the native counter. Defaults to `heuristic` (matches the TS fallback). */
  tokenFamily?: TokenFamily
  /** How to compact when over budget. Defaults to `drop-oldest`. */
  compaction?: CompactionStrategy
}

const CHARS_PER_TOKEN = 4
const NON_TEXT_BLOCK = 32

export const estimateTokens: TokenCounter = (messages, system) => {
  let chars = system ? system.length : 0
  for (const message of messages) {
    chars +=
      typeof message.content === "string"
        ? message.content.length
        : message.content.reduce((sum, block) => sum + blockChars(block), 0)
  }
  return Math.ceil(chars / CHARS_PER_TOKEN)
}

function blockChars(block: { type: string; text?: string }): number {
  return block.text ? block.text.length : NON_TEXT_BLOCK // non-text blocks cost a flat estimate
}

/** Per-message token counts plus the system-prompt count — the input to O(n) trimming. */
interface Counts {
  system: number
  each: number[]
}

/**
 * Count the system prompt and every message once. Prefers the native addon's `countMessages`
 * (one call, accurate BPE) and only falls back to the injected/heuristic counter per message —
 * so a full transcript is measured in a single pass, never re-counted per dropped turn.
 */
function countPerMessage(
  messages: readonly Message[],
  system: string | undefined,
  family: TokenFamily,
  explicit: TokenCounter | undefined,
): Counts {
  if (!explicit) {
    const addon = nativeAddon()
    if (addon?.countMessages && addon.countText) {
      const each = addon.countMessages(JSON.stringify(messages), family)
      // Guard against a version mismatch (addon that returns the wrong arity).
      if (each.length === messages.length) {
        return { system: system ? addon.countText(system, family) : 0, each }
      }
    }
  }
  const count = explicit ?? estimateTokens
  return {
    system: system ? count([], system) : 0,
    each: messages.map((m) => count([m])),
  }
}

/**
 * Trim `messages` to fit `budget` input tokens using `strategy`, in O(n). Always keeps at least the
 * most recent message; the system prompt and tool schemas are the caller's responsibility and are
 * never dropped here.
 */
function compact(
  messages: readonly Message[],
  counts: Counts,
  budget: number,
  strategy: CompactionStrategy,
): Message[] {
  const available = budget - counts.system
  const total = counts.each.reduce((sum, n) => sum + n, 0)
  if (total <= available) return messages.slice()

  // `middle-out` reserves the first turn (task framing) before filling the recent suffix.
  const first = messages[0]
  const firstCost = counts.each[0] ?? 0
  const keepFirst = strategy === "middle-out" && first !== undefined && firstCost <= available
  // Recent turns fill whatever room the reservation leaves; the first turn's index is off-limits
  // to the suffix so it isn't counted twice.
  const floor = keepFirst ? 1 : 0
  let used = keepFirst ? firstCost : 0
  let firstKept = messages.length - 1 // always keep the last turn

  for (let i = messages.length - 1; i >= floor; i--) {
    const next = used + (counts.each[i] ?? 0)
    if (i < messages.length - 1 && next > available) break
    used = next
    firstKept = i
  }

  const suffix = messages.slice(firstKept)
  return keepFirst && firstKept > 0 && first ? [first, ...suffix] : suffix
}

/**
 * Assemble a `ModelRequest` from a conversation. When `budget` is set, the transcript is compacted
 * to fit (keeping the most recent turns); the system prompt and tool schemas are always retained.
 */
export function buildRequest(options: BuildRequestOptions): ModelRequest {
  const system = options.system ?? options.conversation.system
  const family = options.tokenFamily ?? "heuristic"
  let messages = options.conversation.snapshot()

  if (options.budget !== undefined && messages.length > 1) {
    const counts = countPerMessage(messages, system, family, options.countTokens)
    messages = compact(messages, counts, options.budget, options.compaction ?? "drop-oldest")
  }

  const request: ModelRequest = { model: options.model, messages }
  if (system) request.system = system
  if (options.tools?.length) request.tools = options.tools
  if (options.effort) request.effort = options.effort
  if (options.maxTokens !== undefined) request.maxTokens = options.maxTokens
  return request
}
