import { createFakeProvider } from "vibe/model"
import { createCancellationTokenSource } from "vibe/runtime"
import { defineTool } from "vibe/tools"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createAgent } from "../src/agent"
import type { AgentEvent } from "../src/types"

const echo = defineTool({
  name: "echo",
  description: "echoes its input",
  schema: z.object({ value: z.string() }),
  execute: (input) => `echoed: ${input.value}`,
})

describe("createAgent.run", () => {
  it("drives tool_use → tool_result → end_turn and returns the final text", async () => {
    const provider = createFakeProvider([
      { content: [{ type: "toolUse", id: "c1", name: "echo", input: { value: "hi" } }] },
      { content: [{ type: "text", text: "all done" }] },
    ])
    const agent = createAgent({ provider, tools: [echo] })

    const events: AgentEvent[] = []
    const result = await agent.run("go", { onEvent: (e) => events.push(e) })

    expect(result.text).toBe("all done")
    expect(result.stopReason).toBe("end_turn")
    expect(result.iterations).toBe(2)

    // transcript: user, assistant(toolUse), user(toolResult), assistant(text)
    expect(result.transcript.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"])
    const toolResultMsg = result.transcript[2]
    expect(toolResultMsg.content).toEqual([
      { type: "toolResult", toolUseId: "c1", content: "echoed: hi", isError: false },
    ])

    // events include the tool call + its result
    expect(events.find((e) => e.type === "toolCall")).toMatchObject({ name: "echo" })
    expect(events.find((e) => e.type === "toolResult")).toMatchObject({
      content: "echoed: hi",
      isError: false,
    })
    expect(events.at(-1)?.type).toBe("done")
  })

  it("runs parallel tool calls into a single results message", async () => {
    const provider = createFakeProvider([
      {
        content: [
          { type: "toolUse", id: "a", name: "echo", input: { value: "1" } },
          { type: "toolUse", id: "b", name: "echo", input: { value: "2" } },
        ],
      },
      { content: [{ type: "text", text: "combined" }] },
    ])
    const agent = createAgent({ provider, tools: [echo] })
    const result = await agent.run("go")

    const resultsMsg = result.transcript[2]
    expect(resultsMsg.role).toBe("user")
    expect(resultsMsg.content).toEqual([
      { type: "toolResult", toolUseId: "a", content: "echoed: 1", isError: false },
      { type: "toolResult", toolUseId: "b", content: "echoed: 2", isError: false },
    ])
  })

  it("feeds back an isError result for an unknown tool", async () => {
    const provider = createFakeProvider([
      { content: [{ type: "toolUse", id: "x", name: "missing", input: {} }] },
      { content: [{ type: "text", text: "recovered" }] },
    ])
    const agent = createAgent({ provider, tools: [echo] })
    const result = await agent.run("go")
    expect(result.transcript[2].content).toEqual([
      { type: "toolResult", toolUseId: "x", content: 'Unknown tool: "missing"', isError: true },
    ])
    expect(result.text).toBe("recovered")
  })

  it("raises when the iteration ceiling is exceeded", async () => {
    // Provider always asks for a tool → the loop never ends on its own.
    const provider = createFakeProvider([
      { content: [{ type: "toolUse", id: "loop", name: "echo", input: { value: "again" } }] },
    ])
    const agent = createAgent({ provider, tools: [echo] })
    await expect(agent.run("go", { maxIterations: 3 })).rejects.toThrow(/maxIterations/)
  })

  it("cancels mid-run", async () => {
    const cts = createCancellationTokenSource()
    const provider = createFakeProvider([
      { content: [{ type: "toolUse", id: "loop", name: "echo", input: { value: "x" } }] },
    ])
    const agent = createAgent({ provider, tools: [echo] })
    const promise = agent.run("go", { cancellationToken: cts.token })
    cts.cancel("stop now")
    await expect(promise).rejects.toThrow()
  })
})

describe("createAgent timings & cost", () => {
  it("reports per-iteration timings split by model and tools", async () => {
    const provider = createFakeProvider([
      { content: [{ type: "toolUse", id: "c1", name: "echo", input: { value: "hi" } }] },
      { content: [{ type: "text", text: "done" }] },
    ])
    const agent = createAgent({ provider, tools: [echo] })

    const events: AgentEvent[] = []
    const result = await agent.run("go", { onEvent: (e) => events.push(e) })

    // Two model round-trips, one tool batch of one call.
    expect(result.timings.model.calls).toBe(2)
    expect(result.timings.tools.calls).toBe(1)
    expect(result.timings.iterations).toHaveLength(2)
    expect(result.timings.totalMs).toBeGreaterThanOrEqual(0)
    expect(result.timings.model.ms).toBeGreaterThanOrEqual(0)
    // A timing event is emitted per iteration.
    expect(events.filter((e) => e.type === "timing")).toHaveLength(2)
  })

  it("aborts the run once maxCostCents is exceeded", async () => {
    const provider = createFakeProvider([
      // 1M output tokens on claude-opus-4-8 (output $25/1M) = 2500¢, over the 100¢ ceiling.
      {
        content: [{ type: "toolUse", id: "c1", name: "echo", input: { value: "x" } }],
        usage: { outputTokens: 1_000_000 },
      },
      { content: [{ type: "text", text: "should not be reached" }] },
    ])
    const agent = createAgent({ provider, model: "claude-opus-4-8", tools: [echo] })

    await expect(agent.run("go", { maxCostCents: 100 })).rejects.toThrow(/maxCostCents/)
  })

  it("does not abort a cheap run under the cost ceiling", async () => {
    const provider = createFakeProvider([{ content: [{ type: "text", text: "cheap" }] }])
    const agent = createAgent({ provider, model: "claude-opus-4-8" })
    const result = await agent.run("go", { maxCostCents: 100 })
    expect(result.text).toBe("cheap")
  })
})

describe("createAgent.stream", () => {
  it("yields events and returns the result", async () => {
    const provider = createFakeProvider([{ content: [{ type: "text", text: "streamed" }] }])
    const agent = createAgent({ provider })

    const gen = agent.stream("hi")
    const seen: AgentEvent[] = []
    let next = await gen.next()
    while (!next.done) {
      seen.push(next.value)
      next = await gen.next()
    }
    expect(next.value.text).toBe("streamed")
    expect(seen.some((e) => e.type === "text" && e.delta === "streamed")).toBe(true)
    expect(seen[0]).toEqual({ type: "iteration", iteration: 1 })
  })
})
