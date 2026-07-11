import { createCancellationTokenSource } from "@vibe/runtime"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { defineTool } from "../src/define-tool"
import { runToolCall } from "../src/execute"
import { createToolRegistry } from "../src/registry"

const search = defineTool({
  name: "search",
  description: "Search the web",
  schema: z.object({ q: z.string().describe("query") }),
  execute: (input) => `results for ${input.q}`,
})

describe("defineTool", () => {
  it("derives a JSON schema from the Zod schema", () => {
    expect(search.inputSchema).toMatchObject({
      type: "object",
      properties: { q: { type: "string", description: "query" } },
      required: ["q"],
    })
  })
})

describe("createToolRegistry", () => {
  it("registers, looks up, and lists tools", () => {
    const reg = createToolRegistry([search])
    expect(reg.has("search")).toBe(true)
    expect(reg.get("search")).toBe(search)
    expect(reg.list()).toHaveLength(1)
    expect(reg.toSchemas()).toEqual([
      { name: "search", description: "Search the web", inputSchema: search.inputSchema },
    ])
  })

  it("rejects duplicate names", () => {
    const reg = createToolRegistry([search])
    expect(() => reg.register(search)).toThrow(/Duplicate tool name/)
  })
})

describe("runToolCall", () => {
  it("validates input and runs the handler", async () => {
    const res = await runToolCall(search, { q: "vibe" })
    expect(res).toEqual({ content: "results for vibe" })
  })

  it("returns isError on invalid input (never throws)", async () => {
    const res = await runToolCall(search, { q: 123 })
    expect(res.isError).toBe(true)
    expect(res.content).toContain("Invalid input")
  })

  it("turns a thrown handler error into an isError result", async () => {
    const boom = defineTool({
      name: "boom",
      description: "always fails",
      schema: z.object({}),
      execute: () => {
        throw new Error("kaboom")
      },
    })
    const res = await runToolCall(boom, {})
    expect(res).toEqual({ isError: true, content: "kaboom" })
  })

  it("times out a slow handler", async () => {
    const slow = defineTool({
      name: "slow",
      description: "sleeps",
      schema: z.object({}),
      execute: () => new Promise<string>((r) => setTimeout(() => r("done"), 1000)),
    })
    const res = await runToolCall(slow, {}, {}, { timeoutMs: 20 })
    expect(res.isError).toBe(true)
    expect(res.content).toContain("timed out")
  })

  it("propagates cancellation by throwing (unwinds the run)", async () => {
    const cts = createCancellationTokenSource()
    const slow = defineTool({
      name: "cancelme",
      description: "sleeps",
      schema: z.object({}),
      execute: () => new Promise<string>((r) => setTimeout(() => r("done"), 1000)),
    })
    const promise = runToolCall(slow, {}, { cancellationToken: cts.token })
    cts.cancel("user aborted")
    await expect(promise).rejects.toThrow()
  })

  it("throws immediately if already cancelled", async () => {
    const cts = createCancellationTokenSource()
    cts.cancel("already gone")
    await expect(
      runToolCall(search, { q: "x" }, { cancellationToken: cts.token }),
    ).rejects.toThrow()
  })
})
