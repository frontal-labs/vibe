import { describe, expect, it } from "vitest"

import { toAnthropicParams } from "../src/anthropic/map-request"
import { fromAnthropicMessage } from "../src/anthropic/map-response"
import type { ModelRequest } from "../src/types"

const base: ModelRequest = {
  model: "claude-opus-4-8",
  messages: [{ role: "user", content: "hi" }],
}

describe("toAnthropicParams", () => {
  it("defaults model, max_tokens and adaptive thinking", () => {
    const p = toAnthropicParams({ ...base, model: "" })
    expect(p.model).toBe("claude-opus-4-8")
    expect(p.max_tokens).toBe(16_000)
    expect(p.thinking).toEqual({ type: "adaptive" })
  })

  it("never emits temperature/top_p/top_k/budget_tokens", () => {
    const p = toAnthropicParams({ ...base, effort: "high" }) as Record<string, unknown>
    expect(p.temperature).toBeUndefined()
    expect(p.top_p).toBeUndefined()
    expect(p.top_k).toBeUndefined()
    expect(JSON.stringify(p)).not.toContain("budget_tokens")
  })

  it("maps effort to output_config", () => {
    expect(toAnthropicParams({ ...base, effort: "max" }).output_config).toEqual({ effort: "max" })
  })

  it("maps disabled thinking", () => {
    expect(toAnthropicParams({ ...base, thinking: { type: "disabled" } }).thinking).toEqual({
      type: "disabled",
    })
  })

  it("maps tools and tool_choice", () => {
    const p = toAnthropicParams({
      ...base,
      tools: [{ name: "search", description: "d", inputSchema: { type: "object" } }],
      toolChoice: { tool: "search" },
    })
    expect(p.tools).toEqual([
      { name: "search", description: "d", input_schema: { type: "object" } },
    ])
    expect(p.tool_choice).toEqual({ type: "tool", name: "search" })
  })

  it("maps structured content blocks", () => {
    const p = toAnthropicParams({
      ...base,
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "t" },
            { type: "toolUse", id: "1", name: "n", input: { a: 1 } },
          ],
        },
        {
          role: "user",
          content: [{ type: "toolResult", toolUseId: "1", content: "ok" }],
        },
      ],
    })
    expect(p.messages[0].content).toEqual([
      { type: "text", text: "t" },
      { type: "tool_use", id: "1", name: "n", input: { a: 1 } },
    ])
    expect(p.messages[1].content).toEqual([
      { type: "tool_result", tool_use_id: "1", content: "ok", is_error: undefined },
    ])
  })
})

describe("fromAnthropicMessage", () => {
  it("normalizes blocks, stop reason and usage", () => {
    const res = fromAnthropicMessage({
      content: [
        { type: "thinking", thinking: "reasoning" },
        { type: "text", text: "answer" },
        { type: "tool_use", id: "1", name: "search", input: { q: "x" } },
      ],
      stop_reason: "pause_turn",
      usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 5 },
      model: "claude-opus-4-8",
    })
    expect(res.content).toEqual([
      { type: "thinking", text: "reasoning" },
      { type: "text", text: "answer" },
      { type: "toolUse", id: "1", name: "search", input: { q: "x" } },
    ])
    expect(res.stopReason).toBe("pause")
    expect(res.usage).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      cacheReadTokens: 5,
      cacheWriteTokens: undefined,
    })
  })

  it("falls back to end_turn on null stop_reason", () => {
    const res = fromAnthropicMessage({
      content: [],
      stop_reason: null,
      usage: { input_tokens: 1, output_tokens: 1 },
      model: "m",
    })
    expect(res.stopReason).toBe("end_turn")
  })
})
