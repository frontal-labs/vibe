import type { ContentBlock, ModelResponse, StopReason } from "../types"

/** The subset of an Anthropic `Message` this normalizer reads (SDK-type-free). */
export interface AnthropicMessageLike {
  content: Array<{
    type: string
    text?: string
    thinking?: string
    id?: string
    name?: string
    input?: unknown
  }>
  stop_reason: string | null
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
  model: string
}

const STOP_REASONS: Record<string, StopReason> = {
  end_turn: "end_turn",
  tool_use: "tool_use",
  max_tokens: "max_tokens",
  refusal: "refusal",
  pause_turn: "pause",
}

export function fromAnthropicMessage(message: AnthropicMessageLike): ModelResponse {
  const content: ContentBlock[] = []
  for (const block of message.content) {
    if (block.type === "text") content.push({ type: "text", text: block.text ?? "" })
    else if (block.type === "thinking")
      content.push({ type: "thinking", text: block.thinking ?? "" })
    else if (block.type === "tool_use")
      content.push({
        type: "toolUse",
        id: block.id ?? "",
        name: block.name ?? "",
        input: block.input,
      })
  }
  return {
    content,
    stopReason: STOP_REASONS[message.stop_reason ?? "end_turn"] ?? "end_turn",
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens,
      cacheWriteTokens: message.usage.cache_creation_input_tokens,
    },
    model: message.model,
  }
}
