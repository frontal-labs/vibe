import { describe, expect, it } from "vitest"

import { toOpenAIParams } from "../src/openai/map-request"
import { fromOpenAIResponse } from "../src/openai/map-response"
import { createOpenAIStreamAccumulator } from "../src/openai/stream"
import type { ModelRequest } from "../src/types"

const base: ModelRequest = {
  model: "gpt-4o",
  messages: [{ role: "user", content: "hi" }],
}

describe("toOpenAIParams", () => {
  it("defaults the model and prepends the system message", () => {
    const p = toOpenAIParams({ ...base, model: "", system: "be nice" })
    expect(p.model).toBe("claude-opus-4-8")
    expect(p.messages[0]).toEqual({ role: "system", content: "be nice" })
    expect(p.messages[1]).toEqual({ role: "user", content: "hi" })
  })

  it("maps tools to function tools and tool_choice", () => {
    const p = toOpenAIParams({
      ...base,
      tools: [{ name: "search", description: "d", inputSchema: { type: "object" } }],
      toolChoice: { tool: "search" },
    })
    expect(p.tools).toEqual([
      {
        type: "function",
        function: { name: "search", description: "d", parameters: { type: "object" } },
      },
    ])
    expect(p.tool_choice).toEqual({ type: "function", function: { name: "search" } })
  })

  it("maps 'any' tool choice to 'required'", () => {
    expect(toOpenAIParams({ ...base, toolChoice: "any" }).tool_choice).toBe("required")
  })

  it("fans a structured assistant/user turn into flat messages", () => {
    const p = toOpenAIParams({
      ...base,
      messages: [
        {
          role: "assistant",
          content: [
            { type: "thinking", text: "hmm" },
            { type: "text", text: "calling" },
            { type: "toolUse", id: "call_1", name: "search", input: { q: "x" } },
          ],
        },
        { role: "user", content: [{ type: "toolResult", toolUseId: "call_1", content: "ok" }] },
      ],
    })
    // thinking dropped; text + tool_calls collapsed into one assistant message
    expect(p.messages[0]).toEqual({
      role: "assistant",
      content: "calling",
      tool_calls: [
        { id: "call_1", type: "function", function: { name: "search", arguments: '{"q":"x"}' } },
      ],
    })
    // tool result becomes its own role:"tool" message
    expect(p.messages[1]).toEqual({ role: "tool", tool_call_id: "call_1", content: "ok" })
  })

  it("sets stream and max_tokens only when provided", () => {
    expect(toOpenAIParams(base).stream).toBeUndefined()
    expect(toOpenAIParams(base).max_tokens).toBeUndefined()
    const p = toOpenAIParams({ ...base, stream: true, maxTokens: 128 })
    expect(p.stream).toBe(true)
    expect(p.max_tokens).toBe(128)
  })
})

describe("fromOpenAIResponse", () => {
  it("normalizes text, tool calls, finish reason and usage", () => {
    const res = fromOpenAIResponse({
      model: "gpt-4o",
      choices: [
        {
          message: {
            content: "answer",
            tool_calls: [{ id: "call_1", function: { name: "search", arguments: '{"q":"x"}' } }],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    })
    expect(res.content).toEqual([
      { type: "text", text: "answer" },
      { type: "toolUse", id: "call_1", name: "search", input: { q: "x" } },
    ])
    expect(res.stopReason).toBe("tool_use")
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 20 })
  })

  it("tolerates malformed tool arguments and missing usage", () => {
    const res = fromOpenAIResponse({
      model: "m",
      choices: [
        {
          message: { tool_calls: [{ id: "c", function: { name: "n", arguments: "{oops" } }] },
          finish_reason: "stop",
        },
      ],
    })
    expect(res.content[0]).toEqual({ type: "toolUse", id: "c", name: "n", input: {} })
    expect(res.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
  })
})

describe("createOpenAIStreamAccumulator", () => {
  it("yields text deltas and assembles piecewise tool calls", () => {
    const acc = createOpenAIStreamAccumulator()
    const deltas: string[] = []
    const push = (chunk: Parameters<typeof acc.push>[0]) => {
      for (const e of acc.push(chunk)) if (e.type === "text") deltas.push(e.delta)
    }
    push({ model: "gpt-4o", choices: [{ delta: { content: "Hel" } }] })
    push({ choices: [{ delta: { content: "lo" } }] })
    push({
      choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "sea" } }] } }],
    })
    push({
      choices: [
        { delta: { tool_calls: [{ index: 0, function: { name: "rch", arguments: '{"q":' } }] } },
      ],
    })
    push({
      choices: [
        {
          delta: { tool_calls: [{ index: 0, function: { arguments: '"x"}' } }] },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    })

    expect(deltas.join("")).toBe("Hello")
    const toolUse = acc.toolUseEvents()
    expect(toolUse).toEqual([{ type: "toolUse", id: "call_1", name: "search", input: { q: "x" } }])
    const res = acc.response()
    expect(res.content).toEqual([
      { type: "text", text: "Hello" },
      { type: "toolUse", id: "call_1", name: "search", input: { q: "x" } },
    ])
    expect(res.stopReason).toBe("tool_use")
    expect(res.usage).toEqual({ inputTokens: 3, outputTokens: 4 })
    expect(res.model).toBe("gpt-4o")
  })
})
