import { nativeAddon } from "@vibe/shared"

import type { ModelProvider, ModelRequest, ModelResponse, ModelStreamEvent } from "../types"
import { mapOpenAIError } from "./errors"
import { toOpenAIParams } from "./map-request"
import { fromOpenAIResponse, type OpenAICompletionLike } from "./map-response"
import { createOpenAIStreamAccumulator, type OpenAIStreamChunk } from "./stream"

/** A minimal `fetch` signature so a custom/mocked fetch can be injected in tests. */
export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<Response>

export interface OpenAIProviderOptions {
  apiKey?: string
  /** Backend base URL. Defaults to OpenAI; point at Azure/vLLM/Ollama/together as needed. */
  baseURL?: string
  /** Extra headers (e.g. `OpenAI-Organization`, Azure `api-key`). */
  headers?: Record<string, string>
  /** Inject a custom `fetch` (defaults to the global). */
  fetch?: FetchLike
  /**
   * Fold the SSE stream with the native `vibe_sse` addon (when `VIBE_NATIVE_ADDON` is set) instead
   * of the incremental TS accumulator. Buffers the whole body, so text arrives in one batch rather
   * than as live deltas — trade partial-output latency for lower per-chunk overhead on high-volume
   * streams. Defaults to `false` (incremental). Falls back to the TS path if the addon is absent.
   */
  nativeSse?: boolean
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1"

/**
 * An OpenAI-compatible `ModelProvider` implemented over plain HTTP, so it drives
 * any backend that speaks the Chat Completions API (OpenAI, Azure OpenAI, vLLM,
 * Ollama, together, …) without pulling in a vendor SDK.
 */
export function createOpenAIProvider(options: OpenAIProviderOptions = {}): ModelProvider {
  // Fall back to the conventional env vars so `openai()` works with no args.
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY
  const baseURL = (options.baseURL ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).replace(
    /\/$/,
    "",
  )
  const doFetch = options.fetch ?? (globalThis.fetch as unknown as FetchLike)
  const headers = (): Record<string, string> => ({
    "content-type": "application/json",
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    ...options.headers,
  })

  const post = async (body: unknown): Promise<Response> => {
    const response = await doFetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText)
      throw mapOpenAIError(response.status, detail || response.statusText)
    }
    return response
  }

  return {
    id: "openai",

    async generate(request: ModelRequest): Promise<ModelResponse> {
      const response = await post(toOpenAIParams({ ...request, stream: false }))
      const completion = (await response.json()) as OpenAICompletionLike
      return fromOpenAIResponse(completion)
    },

    async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
      const response = await post(toOpenAIParams({ ...request, stream: true }))
      const fold = options.nativeSse ? nativeAddon()?.sseFold : undefined
      if (fold) {
        yield* foldNative(fold, await response.text())
        return
      }
      const accumulator = createOpenAIStreamAccumulator()
      for await (const chunk of parseSseChunks(response)) {
        for (const event of accumulator.push(chunk)) yield event
      }
      for (const event of accumulator.toolUseEvents()) yield event
      yield { type: "done", response: accumulator.response() }
    },
  }
}

/** The shape returned by the native `sse_fold` binding (JSON). */
interface NativeFold {
  events: ModelStreamEvent[]
  response: ModelResponse
}

/**
 * Replay a natively-folded SSE body as the same event order the TS accumulator produces: text
 * deltas, then the tool-use blocks, then `done`. Falls back to a single `done` if the JSON is
 * unexpected, so a bad addon can never break a run.
 */
function* foldNative(fold: (body: string) => string, body: string): Generator<ModelStreamEvent> {
  const parsed = JSON.parse(fold(body)) as NativeFold
  for (const event of parsed.events) yield event
  for (const block of parsed.response.content) {
    if (block.type === "toolUse") {
      yield { type: "toolUse", id: block.id, name: block.name, input: block.input }
    }
  }
  yield { type: "done", response: parsed.response }
}

/**
 * Parse an OpenAI SSE response body into decoded `data:` chunk objects, stopping
 * at the `[DONE]` sentinel. Buffers across reads so partial lines are handled.
 */
async function* parseSseChunks(response: Response): AsyncGenerator<OpenAIStreamChunk> {
  const body = response.body
  if (!body) return
  const decoder = new TextDecoder()
  let buffer = ""
  for await (const bytes of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(bytes, { stream: true })
    let newline = buffer.indexOf("\n")
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf("\n")
      if (!line.startsWith("data:")) continue
      const data = line.slice(5).trim()
      if (data === "[DONE]") return
      if (data) yield JSON.parse(data) as OpenAIStreamChunk
    }
  }
}
