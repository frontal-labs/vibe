import type { ContentBlock, ModelResponse, ModelStreamEvent, TokenUsage } from "../types"
import { FINISH_REASONS, parseArguments } from "./map-response"

/** A streamed chunk from OpenAI `chat/completions` with `stream:true`. */
export interface OpenAIStreamChunk {
  model?: string
  choices?: Array<{
    delta?: {
      content?: string | null
      tool_calls?: Array<{
        index: number
        id?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason?: string | null
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

interface ToolCallSlot {
  id: string
  name: string
  args: string
}

/**
 * Fold OpenAI streaming chunks into text deltas plus a final {@link ModelResponse}.
 * OpenAI streams tool calls piecewise (by `index`), so name/arguments are
 * concatenated across chunks before being parsed at the end.
 */
export function createOpenAIStreamAccumulator() {
  let model = ""
  let text = ""
  let finishReason: string | null = null
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
  const slots: ToolCallSlot[] = []

  return {
    /** Feed one chunk; returns the text deltas to yield (if any). */
    push(chunk: OpenAIStreamChunk): ModelStreamEvent[] {
      const events: ModelStreamEvent[] = []
      if (chunk.model) model = chunk.model
      if (chunk.usage) {
        usage.inputTokens = chunk.usage.prompt_tokens ?? usage.inputTokens
        usage.outputTokens = chunk.usage.completion_tokens ?? usage.outputTokens
      }
      const choice = chunk.choices?.[0]
      if (!choice) return events
      if (choice.finish_reason) finishReason = choice.finish_reason

      const delta = choice.delta
      if (delta?.content) {
        text += delta.content
        events.push({ type: "text", delta: delta.content })
      }
      for (const call of delta?.tool_calls ?? []) {
        let slot = slots[call.index]
        if (!slot) {
          slot = { id: "", name: "", args: "" }
          slots[call.index] = slot
        }
        if (call.id) slot.id = call.id
        if (call.function?.name) slot.name += call.function.name
        if (call.function?.arguments) slot.args += call.function.arguments
      }
      return events
    },

    /** The `toolUse` events for the accumulated tool calls (emitted before `done`). */
    toolUseEvents(): ModelStreamEvent[] {
      return slots
        .filter((s): s is ToolCallSlot => Boolean(s))
        .map((s) => ({ type: "toolUse", id: s.id, name: s.name, input: parseArguments(s.args) }))
    },

    /** The final normalized response once the stream is done. */
    response(): ModelResponse {
      const content: ContentBlock[] = []
      if (text) content.push({ type: "text", text })
      for (const slot of slots) {
        if (slot) {
          content.push({
            type: "toolUse",
            id: slot.id,
            name: slot.name,
            input: parseArguments(slot.args),
          })
        }
      }
      return {
        content,
        stopReason: FINISH_REASONS[finishReason ?? "stop"] ?? "end_turn",
        usage,
        model,
      }
    },
  }
}
