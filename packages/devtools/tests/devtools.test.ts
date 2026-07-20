import type { AgentEvent, AgentResult } from "vibe/agent"
import type { Message } from "vibe/model"
import { describe, expect, it } from "vitest"

import { estimateCost, MODEL_PRICING } from "../src/cost"
import { createEventPrinter } from "../src/events"
import { formatTranscript, formatUsage, summarizeResult } from "../src/format"

describe("estimateCost", () => {
  it("prices input+output from the model table", () => {
    const cost = estimateCost(
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      "claude-opus-4-8",
    )
    expect(cost.inputUsd).toBe(5)
    expect(cost.outputUsd).toBe(25)
    expect(cost.totalUsd).toBe(30)
  })
  it("counts cache tokens at the input rate", () => {
    const cost = estimateCost(
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 },
      "claude-opus-4-8",
    )
    expect(cost.inputUsd).toBe(5)
  })
  it("unknown models cost 0", () => {
    expect(estimateCost({ inputTokens: 100, outputTokens: 100 }, "mystery").totalUsd).toBe(0)
  })
  it("exposes a pricing table", () => {
    expect(MODEL_PRICING["claude-haiku-4-5"]).toEqual({ input: 1, output: 5 })
  })
})

describe("formatting", () => {
  it("formatUsage summarizes tokens", () => {
    expect(formatUsage({ inputTokens: 10, outputTokens: 5 })).toBe("in=10 out=5 total=15")
  })
  it("formatTranscript renders roles and blocks", () => {
    const transcript: Message[] = [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: [{ type: "toolUse", id: "1", name: "search", input: { q: "x" } }],
      },
      { role: "user", content: [{ type: "toolResult", toolUseId: "1", content: "ok" }] },
    ]
    const out = formatTranscript(transcript)
    expect(out).toContain("user")
    expect(out).toContain("→ search(")
    expect(out).toContain("← ok")
  })
  it("summarizeResult includes stop reason and cost", () => {
    const result = {
      text: "x",
      response: {
        content: [],
        stopReason: "end_turn",
        usage: { inputTokens: 0, outputTokens: 0 },
        model: "m",
      },
      usage: { inputTokens: 1000, outputTokens: 1000 },
      iterations: 2,
      stopReason: "end_turn",
      transcript: [],
    } satisfies AgentResult
    const summary = summarizeResult(result, "claude-opus-4-8")
    expect(summary).toContain("stop=end_turn")
    expect(summary).toContain("iterations=2")
    expect(summary).toContain("$")
  })
})

describe("createEventPrinter", () => {
  it("prints one line per event type", () => {
    const lines: string[] = []
    const print = createEventPrinter((line) => lines.push(line))
    const events: AgentEvent[] = [
      { type: "iteration", iteration: 1 },
      { type: "toolCall", id: "1", name: "search", input: {} },
      { type: "toolResult", id: "1", name: "search", content: "ok", isError: false },
    ]
    for (const event of events) print(event)
    expect(lines[0]).toContain("iteration 1")
    expect(lines[1]).toContain("→ search")
    expect(lines[2]).toContain("← ok")
  })
})
