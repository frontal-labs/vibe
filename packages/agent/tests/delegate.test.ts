import { createFakeProvider } from "@vibe/model"
import { describe, expect, it } from "vitest"

import { createAgent } from "../src/agent"
import { createDelegateTool } from "../src/delegate"

describe("createDelegateTool", () => {
  it("lets a coordinator delegate a subtask and get the worker's answer", async () => {
    // Worker provider: answers any task with a fixed string.
    const workerProvider = createFakeProvider([{ content: [{ type: "text", text: "42" }] }])
    const delegate = createDelegateTool({
      provider: workerProvider,
      name: "compute",
      description: "compute things",
    })

    // Coordinator: first calls the delegate tool, then reports the result.
    const coordinatorProvider = createFakeProvider([
      { content: [{ type: "toolUse", id: "d1", name: "compute", input: { task: "what is 6*7" } }] },
      { content: [{ type: "text", text: "the worker said 42" }] },
    ])
    const coordinator = createAgent({ provider: coordinatorProvider, tools: [delegate] })

    const result = await coordinator.run("delegate please")
    expect(result.text).toBe("the worker said 42")

    // The tool result carried the sub-agent's answer back into the transcript.
    expect(result.transcript[2].content).toEqual([
      { type: "toolResult", toolUseId: "d1", content: "42", isError: false },
    ])
  })

  it("defaults the tool name to 'delegate'", () => {
    const tool = createDelegateTool({
      provider: createFakeProvider([{ content: [{ type: "text", text: "x" }] }]),
    })
    expect(tool.name).toBe("delegate")
    expect(tool.inputSchema).toMatchObject({ properties: { task: { type: "string" } } })
  })
})
