import type {
  ContentBlock,
  ModelProvider,
  ModelResponse,
  ModelStreamEvent,
  TokenUsage,
} from "../types"

export interface FakeTurn {
  content: ContentBlock[]
  stopReason?: ModelResponse["stopReason"]
  usage?: Partial<TokenUsage>
}

/**
 * A deterministic provider driven by a scripted list of turns — the testable
 * substitute the agent loop is verified against (no network, no key). The last
 * turn repeats if the loop asks for more.
 */
export function createFakeProvider(script: FakeTurn[]): ModelProvider {
  let index = 0
  const nextResponse = (): ModelResponse => {
    const turn = script[Math.min(index, script.length - 1)] ?? { content: [] }
    index += 1
    const stopReason =
      turn.stopReason ?? (turn.content.some((b) => b.type === "toolUse") ? "tool_use" : "end_turn")
    return {
      content: turn.content,
      stopReason,
      usage: { inputTokens: 0, outputTokens: 0, ...turn.usage },
      model: "fake",
    }
  }

  return {
    id: "fake",
    async generate() {
      return nextResponse()
    },
    async *stream() {
      const response = nextResponse()
      for (const block of response.content) {
        if (block.type === "text") yield { type: "text", delta: block.text } as ModelStreamEvent
        else if (block.type === "thinking")
          yield { type: "thinking", delta: block.text } as ModelStreamEvent
        else if (block.type === "toolUse")
          yield {
            type: "toolUse",
            id: block.id,
            name: block.name,
            input: block.input,
          } as ModelStreamEvent
      }
      yield { type: "done", response }
    },
    async countTokens() {
      return 0
    },
  }
}
