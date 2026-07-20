import { KNOWN_MODEL_IDS } from "vibe/model"

import type { AgentLike } from "./types"

/** A single OpenAI chat message (string or content-part array). */
export interface OpenAIChatMessage {
  readonly role: string
  readonly content?: string | ReadonlyArray<{ type?: string; text?: string }>
}

/** An OpenAI Chat Completions request (the subset this surface reads). */
export interface OpenAIChatRequest {
  readonly model?: string
  readonly messages?: ReadonlyArray<OpenAIChatMessage>
  readonly stream?: boolean
}

export interface OpenAICompatOptions {
  /** Path for the chat-completions endpoint (default `/v1/chat/completions`). */
  readonly chatPath?: string
  /** Path for the models listing (default `/v1/models`). */
  readonly modelsPath?: string
  /** Reported model id when the request omits one. */
  readonly defaultModel?: string
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/** Flatten OpenAI message content (string or content-part array) to plain text. */
function contentToText(content: OpenAIChatMessage["content"]): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("")
  }
  return ""
}

/**
 * Render a chat history into a single prompt. A lone user message is passed
 * through verbatim; a multi-turn history is serialized as a labeled transcript so
 * context is preserved (the agent supplies its own system prompt).
 */
function messagesToPrompt(messages: ReadonlyArray<OpenAIChatMessage> = []): string {
  const relevant = messages.filter((m) => m.role !== "system")
  const only = relevant[0]
  if (relevant.length === 1 && only?.role === "user") {
    return contentToText(only.content)
  }
  return relevant.map((m) => `${m.role}: ${contentToText(m.content)}`).join("\n")
}

// Non-cryptographic id; fine for correlating a single response.
function completionId(): string {
  return `chatcmpl-${Math.random().toString(36).slice(2, 14)}`
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

/** OpenAI streaming chunks for a completed agent run's text, ending with `[DONE]`. */
function toOpenAIStream(
  agent: AgentLike,
  prompt: string,
  model: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const id = completionId()
  const created = nowSeconds()
  const chunk = (delta: Record<string, unknown>, finish: string | null) =>
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => controller.enqueue(encoder.encode(s))
      try {
        send(chunk({ role: "assistant" }, null))
        const gen = agent.stream({ text: prompt })
        let next = await gen.next()
        while (!next.done) {
          if (next.value.type === "text") send(chunk({ content: next.value.delta }, null))
          next = await gen.next()
        }
        send(chunk({}, "stop"))
        send("data: [DONE]\n\n")
      } catch (error) {
        send(
          `data: ${JSON.stringify({
            error: { message: error instanceof Error ? error.message : String(error) },
          })}\n\n`,
        )
      } finally {
        controller.close()
      }
    },
  })
}

/**
 * Expose an agent behind the OpenAI Chat Completions API, so any OpenAI SDK/client
 * can call it: `POST /v1/chat/completions` (streaming and non-streaming) plus
 * `GET /v1/models`. Mount alongside {@link toFetchHandler} to serve both the
 * Vibe-native and OpenAI-compatible surfaces from one server.
 */
export function toOpenAICompatHandler(agent: AgentLike, options: OpenAICompatOptions = {}) {
  const chatPath = options.chatPath ?? "/v1/chat/completions"
  const modelsPath = options.modelsPath ?? "/v1/models"
  const defaultModel = options.defaultModel ?? "vibe"

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)

    if (request.method === "GET" && url.pathname === modelsPath) {
      const created = nowSeconds()
      return json({
        object: "list",
        data: KNOWN_MODEL_IDS.map((id) => ({ id, object: "model", created, owned_by: "vibe" })),
      })
    }

    if (url.pathname !== chatPath) return json({ error: { message: "Not found" } }, 404)
    if (request.method !== "POST") {
      return json(
        { error: { message: "Method not allowed. POST a chat completion request." } },
        405,
      )
    }

    let body: OpenAIChatRequest
    try {
      body = (await request.json()) as OpenAIChatRequest
    } catch {
      return json({ error: { message: "Invalid JSON body." } }, 400)
    }

    const prompt = messagesToPrompt(body.messages)
    if (prompt.length === 0) {
      return json({ error: { message: "No messages provided." } }, 400)
    }
    const model = body.model ?? defaultModel

    if (body.stream === true) {
      return new Response(toOpenAIStream(agent, prompt, model), {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        },
      })
    }

    const result = await agent.run({ text: prompt })
    const finishReason = result.stopReason === "max_tokens" ? "length" : "stop"
    return json({
      id: completionId(),
      object: "chat.completion",
      created: nowSeconds(),
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: result.text },
          finish_reason: finishReason,
        },
      ],
      usage: {
        prompt_tokens: result.usage.inputTokens,
        completion_tokens: result.usage.outputTokens,
        total_tokens: result.usage.inputTokens + result.usage.outputTokens,
      },
    })
  }
}
