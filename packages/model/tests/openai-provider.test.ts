import { describe, expect, it } from "vitest"

import { createOpenAIProvider, type FetchLike } from "../src/openai/provider"
import type { ModelStreamEvent } from "../src/types"

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status })
}

function sseResponse(chunks: unknown[]): Response {
  const body = `${chunks.map((c) => `data: ${JSON.stringify(c)}`).join("\n\n")}\n\ndata: [DONE]\n\n`
  return new Response(body)
}

describe("createOpenAIProvider", () => {
  it("generate posts to <baseURL>/chat/completions and normalizes the response", async () => {
    let calledUrl = ""
    let sentBody: Record<string, unknown> = {}
    const fetchLike: FetchLike = (url, init) => {
      calledUrl = url
      sentBody = JSON.parse(init.body)
      return jsonResponse({
        model: "gpt-4o",
        choices: [{ message: { content: "hi" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 2 },
      })
    }
    const provider = createOpenAIProvider({
      apiKey: "sk-test",
      baseURL: "https://x/v1/",
      fetch: fetchLike,
    })
    const res = await provider.generate({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hey" }],
    })

    expect(calledUrl).toBe("https://x/v1/chat/completions")
    expect(sentBody.stream).toBeUndefined()
    expect(res.content).toEqual([{ type: "text", text: "hi" }])
    expect(res.stopReason).toBe("end_turn")
  })

  it("maps HTTP errors to typed errors", async () => {
    const fetchLike: FetchLike = () => jsonResponse({ error: "nope" }, 401)
    const provider = createOpenAIProvider({ fetch: fetchLike })
    await expect(provider.generate({ model: "gpt-4o", messages: [] })).rejects.toThrow()
  })

  it("stream parses SSE chunks into text deltas then a done event", async () => {
    const fetchLike: FetchLike = async () =>
      sseResponse([
        { model: "gpt-4o", choices: [{ delta: { content: "Hel" } }] },
        { choices: [{ delta: { content: "lo" } }] },
        {
          choices: [{ delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        },
      ])
    const provider = createOpenAIProvider({ fetch: fetchLike })
    const events: ModelStreamEvent[] = []
    for await (const e of provider.stream({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
    })) {
      events.push(e)
    }
    const texts = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta)
    expect(texts.join("")).toBe("Hello")
    const done = events.at(-1)
    expect(done?.type).toBe("done")
    if (done?.type === "done")
      expect(done.response.content).toEqual([{ type: "text", text: "Hello" }])
  })
})
