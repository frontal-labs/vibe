import { createAgent } from "vibe/agent"
import { createFakeProvider } from "vibe/model"
import { describe, expect, it } from "vitest"

import { toOpenAICompatHandler } from "../src/openai-compat"

function agentSaying(text: string) {
  return createAgent({ provider: createFakeProvider([{ content: [{ type: "text", text }] }]) })
}

const chat = (body: unknown, url = "http://x/v1/chat/completions") =>
  new Request(url, { method: "POST", body: JSON.stringify(body) })

describe("toOpenAICompatHandler", () => {
  it("answers a chat completion in OpenAI shape", async () => {
    const res = await toOpenAICompatHandler(agentSaying("hello world"))(
      chat({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }] }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      object: string
      model: string
      choices: Array<{ message: { role: string; content: string }; finish_reason: string }>
      usage: { total_tokens: number }
    }
    expect(body.object).toBe("chat.completion")
    expect(body.model).toBe("gpt-4o")
    expect(body.choices[0].message).toEqual({ role: "assistant", content: "hello world" })
    expect(body.choices[0].finish_reason).toBe("stop")
    expect(body.usage.total_tokens).toBe(0)
  })

  it("flattens array content parts", async () => {
    const res = await toOpenAICompatHandler(agentSaying("ok"))(
      chat({ messages: [{ role: "user", content: [{ type: "text", text: "part" }] }] }),
    )
    expect(res.status).toBe(200)
  })

  it("streams chat.completion.chunk events ending with [DONE]", async () => {
    const res = await toOpenAICompatHandler(agentSaying("streamed"))(
      chat({ model: "gpt-4o", messages: [{ role: "user", content: "go" }], stream: true }),
    )
    expect(res.headers.get("content-type")).toBe("text/event-stream")
    const text = await res.text()
    expect(text).toContain("chat.completion.chunk")
    expect(text).toContain('"content":"streamed"')
    expect(text).toContain('"finish_reason":"stop"')
    expect(text).toContain("data: [DONE]")
  })

  it("lists models at GET /v1/models", async () => {
    const res = await toOpenAICompatHandler(agentSaying("x"))(new Request("http://x/v1/models"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { object: string; data: Array<{ id: string }> }
    expect(body.object).toBe("list")
    expect(body.data.some((m) => m.id === "claude-opus-4-8")).toBe(true)
  })

  it("rejects unknown paths and missing messages", async () => {
    const handler = toOpenAICompatHandler(agentSaying("x"))
    expect((await handler(new Request("http://x/other"))).status).toBe(404)
    expect((await handler(chat({ messages: [] }))).status).toBe(400)
  })
})
