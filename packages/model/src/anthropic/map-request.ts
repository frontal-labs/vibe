import type { ContentBlock, Message, ModelRequest, ThinkingConfig, ToolChoice } from "../types"
import { DEFAULT_MODEL } from "../types"

/**
 * The Anthropic `messages.create` params shape (kept SDK-type-free so this
 * mapping is pure and unit-testable). Honors the current API rules: adaptive
 * thinking by default, **no** `budget_tokens`, **no** `temperature`/`top_p`/`top_k`,
 * effort via `output_config`.
 */
export interface AnthropicParams {
  model: string
  max_tokens: number
  messages: Array<{ role: "user" | "assistant"; content: unknown }>
  system?: string
  tools?: Array<{ name: string; description?: string; input_schema: Record<string, unknown> }>
  tool_choice?: unknown
  thinking?: { type: string; display?: string }
  output_config?: { effort: string }
}

export function toAnthropicParams(request: ModelRequest): AnthropicParams {
  const params: AnthropicParams = {
    model: request.model || DEFAULT_MODEL,
    max_tokens: request.maxTokens ?? 16_000,
    messages: request.messages.map(toAnthropicMessage),
    thinking: mapThinking(request.thinking),
  }
  if (request.system) params.system = request.system
  if (request.tools?.length) {
    params.tools = request.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }))
  }
  if (request.toolChoice) params.tool_choice = mapToolChoice(request.toolChoice)
  if (request.effort) params.output_config = { effort: request.effort }
  return params
}

function mapThinking(thinking: ThinkingConfig | undefined): { type: string; display?: string } {
  if (!thinking) return { type: "adaptive" } // adaptive is not implicit — set it explicitly
  if (thinking.type === "disabled") return { type: "disabled" }
  return thinking.display ? { type: "adaptive", display: thinking.display } : { type: "adaptive" }
}

function mapToolChoice(choice: ToolChoice): unknown {
  if (choice === "auto") return { type: "auto" }
  if (choice === "any") return { type: "any" }
  if (choice === "none") return { type: "none" }
  return { type: "tool", name: choice.tool }
}

function toAnthropicMessage(message: Message): { role: "user" | "assistant"; content: unknown } {
  if (typeof message.content === "string") {
    return { role: message.role, content: message.content }
  }
  return { role: message.role, content: message.content.map(toAnthropicBlock) }
}

function toAnthropicBlock(block: ContentBlock): unknown {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text }
    case "thinking":
      return { type: "thinking", thinking: block.text }
    case "toolUse":
      return { type: "tool_use", id: block.id, name: block.name, input: block.input }
    case "toolResult":
      return {
        type: "tool_result",
        tool_use_id: block.toolUseId,
        content: block.content,
        is_error: block.isError,
      }
  }
}
