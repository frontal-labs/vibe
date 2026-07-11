import { describe, expect, it } from "vitest"

import { createFakeProvider } from "../src/fake/provider"
import type { ModelRequest } from "../src/types"

const req = (text: string): ModelRequest => ({
  model: "claude-opus-4-8",
  messages: [{ role: "user", content: text }],
})

describe("createFakeProvider", () => {
  it("returns scripted text and infers end_turn", async () => {
    const provider = createFakeProvider([{ content: [{ type: "text", text: "hello" }] }])
    const res = await provider.generate(req("hi"))
    expect(res.content).toEqual([{ type: "text", text: "hello" }])
    expect(res.stopReason).toBe("end_turn")
  })

  it("infers tool_use when a toolUse block is present", async () => {
    const provider = createFakeProvider([
      { content: [{ type: "toolUse", id: "t1", name: "search", input: { q: "x" } }] },
    ])
    const res = await provider.generate(req("search"))
    expect(res.stopReason).toBe("tool_use")
  })

  it("advances through turns and repeats the last", async () => {
    const provider = createFakeProvider([
      { content: [{ type: "text", text: "one" }] },
      { content: [{ type: "text", text: "two" }] },
    ])
    expect((await provider.generate(req("a"))).content).toEqual([{ type: "text", text: "one" }])
    expect((await provider.generate(req("b"))).content).toEqual([{ type: "text", text: "two" }])
    // exhausted → last repeats
    expect((await provider.generate(req("c"))).content).toEqual([{ type: "text", text: "two" }])
  })

  it("honors explicit stopReason (e.g. refusal)", async () => {
    const provider = createFakeProvider([{ content: [], stopReason: "refusal" }])
    expect((await provider.generate(req("x"))).stopReason).toBe("refusal")
  })

  it("streams deltas then a done event", async () => {
    const provider = createFakeProvider([{ content: [{ type: "text", text: "stream me" }] }])
    const events = []
    for await (const ev of provider.stream(req("go"))) events.push(ev)
    expect(events.at(-1)?.type).toBe("done")
    const text = events
      .filter((e) => e.type === "text")
      .map((e) => (e as { delta: string }).delta)
      .join("")
    expect(text).toBe("stream me")
  })
})
