import { createAgent } from "@vibe/agent"
import { createFakeProvider } from "@vibe/model"
import { describe, expect, it } from "vitest"

import { toFetchHandler } from "../src/fetch"

function agentSaying(text: string) {
  return createAgent({ provider: createFakeProvider([{ content: [{ type: "text", text }] }]) })
}

const post = (body: unknown, url = "http://x/ask") =>
  new Request(url, { method: "POST", body: JSON.stringify(body) })

describe("toFetchHandler", () => {
  it("answers a prompt as JSON", async () => {
    const res = await toFetchHandler(agentSaying("hi there"))(post({ prompt: "hello" }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { text: string; stopReason: string }
    expect(body.text).toBe("hi there")
    expect(body.stopReason).toBe("end_turn")
  })

  it("accepts { text } as an alias for { prompt }", async () => {
    const res = await toFetchHandler(agentSaying("aliased"))(post({ text: "hello" }))
    expect(((await res.json()) as { text: string }).text).toBe("aliased")
  })

  it("rejects non-POST with 405", async () => {
    const res = await toFetchHandler(agentSaying("x"))(new Request("http://x/ask"))
    expect(res.status).toBe(405)
  })

  it("rejects a missing prompt with 400", async () => {
    const res = await toFetchHandler(agentSaying("x"))(post({}))
    expect(res.status).toBe(400)
  })

  it("rejects invalid JSON with 400", async () => {
    const res = await toFetchHandler(agentSaying("x"))(
      new Request("http://x/ask", { method: "POST", body: "{not json" }),
    )
    expect(res.status).toBe(400)
  })

  it("honors the path option", async () => {
    const handler = toFetchHandler(agentSaying("x"), { path: "/agent" })
    expect((await handler(post({ prompt: "hi" }, "http://x/other"))).status).toBe(404)
    expect((await handler(post({ prompt: "hi" }, "http://x/agent"))).status).toBe(200)
  })

  it("streams SSE with a final result event", async () => {
    const res = await toFetchHandler(agentSaying("streamed"))(post({ prompt: "go", stream: true }))
    expect(res.headers.get("content-type")).toBe("text/event-stream")
    const text = await res.text()
    expect(text).toContain("event: text")
    expect(text).toContain("event: done")
    expect(text).toContain("event: result")
    expect(text).toContain("streamed")
  })
})
