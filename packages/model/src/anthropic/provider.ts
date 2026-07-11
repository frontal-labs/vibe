import Anthropic from "@anthropic-ai/sdk"

import type { ModelProvider, ModelRequest, ModelResponse, ModelStreamEvent } from "../types"
import { mapAnthropicError } from "./errors"
import { toAnthropicParams } from "./map-request"
import { type AnthropicMessageLike, fromAnthropicMessage } from "./map-response"

export interface AnthropicProviderOptions {
  apiKey?: string
  /** Inject a preconfigured client (e.g. a Bedrock/Vertex client) or a fake in tests. */
  client?: Anthropic
}

/** The reference `ModelProvider`, wrapping `@anthropic-ai/sdk`. */
export function createAnthropicProvider(options: AnthropicProviderOptions = {}): ModelProvider {
  const client = options.client ?? new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {})

  return {
    id: "anthropic",

    async generate(request: ModelRequest): Promise<ModelResponse> {
      const params = toAnthropicParams(request)
      const large = (request.maxTokens ?? 16_000) > 16_000
      try {
        // Stream large outputs to avoid HTTP timeouts, then take the final message.
        const message = large
          ? await client.messages.stream(params as never).finalMessage()
          : await client.messages.create(params as never)
        return fromAnthropicMessage(message as unknown as AnthropicMessageLike)
      } catch (error) {
        const status = (error as { status?: number }).status
        throw mapAnthropicError(status, (error as Error).message, error as Error)
      }
    },

    async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
      const stream = client.messages.stream(toAnthropicParams(request) as never)
      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          const delta = event.delta as { type: string; text?: string; thinking?: string }
          if (delta.type === "text_delta") yield { type: "text", delta: delta.text ?? "" }
          else if (delta.type === "thinking_delta")
            yield { type: "thinking", delta: delta.thinking ?? "" }
        }
      }
      const message = await stream.finalMessage()
      yield {
        type: "done",
        response: fromAnthropicMessage(message as unknown as AnthropicMessageLike),
      }
    },

    async countTokens(request: ModelRequest): Promise<number> {
      const params = toAnthropicParams(request)
      const result = await client.messages.countTokens({
        model: params.model,
        messages: params.messages as never,
        system: params.system,
      } as never)
      return result.input_tokens
    },
  }
}
