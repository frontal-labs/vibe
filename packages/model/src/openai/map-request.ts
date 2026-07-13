import type { Message, ModelRequest, ToolChoice } from "../types"
import { DEFAULT_MODEL } from "../types"

/**
 * The OpenAI `chat/completions` request body (kept SDK-type-free so this mapping
 * is pure and unit-testable). Works against any OpenAI-compatible backend
 * (OpenAI, Azure, vLLM, Ollama, together, …).
 */
export interface OpenAIParams {
  model: string
  messages: OpenAIMessage[]
  tools?: Array<{
    type: "function"
    function: { name: string; description?: string; parameters: Record<string, unknown> }
  }>
  tool_choice?: unknown
  max_tokens?: number
  stream?: boolean
}

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string | null
  tool_calls?: Array<{
    id: string
    type: "function"
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

export function toOpenAIParams(request: ModelRequest): OpenAIParams {
  const messages: OpenAIMessage[] = []
  if (request.system) messages.push({ role: "system", content: request.system })
  for (const message of request.messages) messages.push(...toOpenAIMessages(message))

  const params: OpenAIParams = {
    model: request.model || DEFAULT_MODEL,
    messages,
  }
  if (request.maxTokens !== undefined) params.max_tokens = request.maxTokens
  if (request.stream) params.stream = true
  if (request.tools?.length) {
    params.tools = request.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }))
  }
  if (request.toolChoice) params.tool_choice = mapToolChoice(request.toolChoice)
  return params
}

function mapToolChoice(choice: ToolChoice): unknown {
  if (choice === "auto") return "auto"
  // OpenAI spells "must call some tool" as "required".
  if (choice === "any") return "required"
  if (choice === "none") return "none"
  return { type: "function", function: { name: choice.tool } }
}

/**
 * Map one normalized {@link Message} to one-or-more OpenAI messages. OpenAI's wire
 * format is flat: tool results are their own `role:"tool"` messages, and assistant
 * tool calls live in a `tool_calls` array — so a single structured message can fan
 * out. `thinking` blocks have no OpenAI equivalent and are dropped.
 */
function toOpenAIMessages(message: Message): OpenAIMessage[] {
  if (typeof message.content === "string") {
    return [{ role: message.role, content: message.content }]
  }

  const out: OpenAIMessage[] = []
  const text: string[] = []
  const toolCalls: NonNullable<OpenAIMessage["tool_calls"]> = []

  for (const block of message.content) {
    switch (block.type) {
      case "text":
        text.push(block.text)
        break
      case "thinking":
        break
      case "toolUse":
        toolCalls.push({
          id: block.id,
          type: "function",
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
        })
        break
      case "toolResult":
        out.push({ role: "tool", tool_call_id: block.toolUseId, content: block.content })
        break
    }
  }

  if (text.length > 0 || toolCalls.length > 0) {
    const primary: OpenAIMessage = {
      role: message.role,
      content: text.length > 0 ? text.join("") : null,
    }
    if (toolCalls.length > 0) primary.tool_calls = toolCalls
    // Assistant tool-call/text message precedes any tool-result messages it triggered
    // for user turns; for assistant turns there are no tool results, so order is moot.
    out.unshift(primary)
  }
  return out
}

export { toOpenAIMessages }
