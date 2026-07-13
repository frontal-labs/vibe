import type { ContentBlock, ModelResponse, StopReason } from "../types"

/** The subset of an OpenAI chat completion this normalizer reads (SDK-type-free). */
export interface OpenAICompletionLike {
  model: string
  choices: Array<{
    message: {
      content?: string | null
      tool_calls?: Array<{
        id: string
        function: { name: string; arguments: string }
      }>
    }
    finish_reason: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
  }
}

const FINISH_REASONS: Record<string, StopReason> = {
  stop: "end_turn",
  tool_calls: "tool_use",
  function_call: "tool_use",
  length: "max_tokens",
  content_filter: "refusal",
}

/** Parse a tool-call `arguments` JSON string, tolerating malformed/empty payloads. */
function parseArguments(raw: string): unknown {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function fromOpenAIResponse(completion: OpenAICompletionLike): ModelResponse {
  const choice = completion.choices[0]
  const content: ContentBlock[] = []

  const text = choice?.message.content
  if (text) content.push({ type: "text", text })
  for (const call of choice?.message.tool_calls ?? []) {
    content.push({
      type: "toolUse",
      id: call.id,
      name: call.function.name,
      input: parseArguments(call.function.arguments),
    })
  }

  return {
    content,
    stopReason: FINISH_REASONS[choice?.finish_reason ?? "stop"] ?? "end_turn",
    usage: {
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    },
    model: completion.model,
  }
}

export { FINISH_REASONS, parseArguments }
