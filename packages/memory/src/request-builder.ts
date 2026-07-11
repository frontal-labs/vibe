import type { Effort, Message, ModelId, ModelRequest, ToolSchema } from "@vibe/model"

import type { Conversation } from "./types"

/** Estimate tokens for a message list. Default is ~4 chars/token — cheap and offline. */
export type TokenCounter = (messages: readonly Message[], system?: string) => number

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
  /** How to count tokens; defaults to a char-based heuristic. */
  countTokens?: TokenCounter
}

const CHARS_PER_TOKEN = 4

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
  return block.text ? block.text.length : 32 // non-text blocks cost a flat estimate
}

/**
 * Assemble a `ModelRequest` from a conversation. When `budget` is set, the oldest
 * messages are trimmed (keeping the most recent) until the estimate fits — the
 * system prompt and tool schemas are always retained.
 */
export function buildRequest(options: BuildRequestOptions): ModelRequest {
  const system = options.system ?? options.conversation.system
  const count = options.countTokens ?? estimateTokens
  let messages = options.conversation.snapshot()

  if (options.budget !== undefined) {
    while (messages.length > 1 && count(messages, system) > options.budget) {
      messages = messages.slice(1) // drop the oldest turn
    }
  }

  const request: ModelRequest = { model: options.model, messages }
  if (system) request.system = system
  if (options.tools?.length) request.tools = options.tools
  if (options.effort) request.effort = options.effort
  if (options.maxTokens !== undefined) request.maxTokens = options.maxTokens
  return request
}
