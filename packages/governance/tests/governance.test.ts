import { defineTool, runToolCall } from "vibe/tools"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createApprovalGate } from "../src/approval"
import { guardTool } from "../src/guard"
import { allowTools, createPolicyEngine, denyTools, requireApprovalFor } from "../src/policy"

const echo = defineTool({
  name: "echo",
  description: "echo",
  schema: z.object({ text: z.string() }),
  execute: ({ text }) => text,
})

describe("policy engine", () => {
  it("lets the strictest decision win", async () => {
    const engine = createPolicyEngine([denyTools(["danger"]), requireApprovalFor(["echo"])])
    expect((await engine.evaluate({ tool: "danger", input: {} })).decision).toBe("deny")
    expect((await engine.evaluate({ tool: "echo", input: {} })).decision).toBe("require-approval")
    expect((await engine.evaluate({ tool: "safe", input: {} })).decision).toBe("allow")
  })

  it("allowlist denies unlisted tools", async () => {
    const engine = createPolicyEngine([allowTools(["echo"])])
    expect((await engine.evaluate({ tool: "other", input: {} })).decision).toBe("deny")
  })
})

describe("guardTool", () => {
  it("blocks a denied tool with an error result", async () => {
    const engine = createPolicyEngine([denyTools(["echo"])])
    const guarded = guardTool(echo, engine)
    const result = await runToolCall(guarded, { text: "hi" })
    expect(result.isError).toBe(true)
    expect(result.content).toContain("Denied")
  })

  it("runs a tool once its required approval is granted", async () => {
    const engine = createPolicyEngine([requireApprovalFor(["echo"])])
    const denied = await runToolCall(guardTool(echo, engine, { onApproval: () => false }), {
      text: "hi",
    })
    expect(denied.isError).toBe(true)

    const allowed = await runToolCall(guardTool(echo, engine, { onApproval: () => true }), {
      text: "hi",
    })
    expect(allowed).toEqual({ content: "hi" })
  })
})

describe("approval gate", () => {
  it("suspends until resolved (human-in-the-loop)", async () => {
    const gate = createApprovalGate()
    const pending = gate.request("call-1", { tool: "echo", input: {} })
    expect(gate.pending().map((p) => p.id)).toEqual(["call-1"])
    gate.resolve("call-1", true)
    expect(await pending).toBe(true)
    expect(gate.pending()).toEqual([])
  })
})
