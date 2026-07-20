import { vibe } from "vibe/core"
import { createFakeProvider } from "vibe/model"
import { defineTool } from "vibe/tools"
import { describe, expect, it } from "vitest"
import { z } from "zod"

// End-to-end: core → agent → tools → memory → model, all real, fake provider only.
describe("system.ask end-to-end", () => {
  it("answers a text prompt through the full stack", async () => {
    const system = vibe.system({
      name: "it",
      provider: createFakeProvider([{ content: [{ type: "text", text: "the answer is 42" }] }]),
    })
    await system.start()
    expect(await system.ask("what is the answer?")).toBe("the answer is 42")
    await system.stop()
  })

  it("drives a tool call across the stack", async () => {
    const echo = defineTool({
      name: "echo",
      description: "echo",
      schema: z.object({ value: z.string() }),
      execute: ({ value }) => `echo:${value}`,
    })
    const system = vibe.system({
      name: "it-tools",
      provider: createFakeProvider([
        { content: [{ type: "toolUse", id: "c1", name: "echo", input: { value: "hi" } }] },
        { content: [{ type: "text", text: "done" }] },
      ]),
      tools: [echo],
    })
    await system.start()
    const agent = system.agent()
    const result = await agent.run("use echo")
    expect(result.text).toBe("done")
    expect(
      result.transcript.some(
        (m) => Array.isArray(m.content) && m.content.some((b) => b.type === "toolResult"),
      ),
    ).toBe(true)
    await system.stop()
  })

  it("throws a clear config error without a provider", async () => {
    const system = vibe.system({ name: "no-provider" })
    await system.start()
    await expect(system.ask("hi")).rejects.toThrow(/provider/i)
    await system.stop()
  })
})
