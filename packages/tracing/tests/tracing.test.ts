import type { AgentResult } from "@vibe/agent"
import { describe, expect, it } from "vitest"

import { type StreamableAgent, traceAgentRun } from "../src/agent-bridge"
import { createMemoryExporter } from "../src/exporters"
import { createTracer } from "../src/tracer"

describe("createTracer", () => {
  it("records span timing and attributes via an exporter", () => {
    let t = 0
    const exporter = createMemoryExporter()
    const tracer = createTracer({ exporter, now: () => (t += 5) })
    const span = tracer.startSpan("work")
    span.setAttribute("k", "v")
    span.end()
    expect(exporter.spans).toHaveLength(1)
    expect(exporter.spans[0]).toMatchObject({
      name: "work",
      durationMs: 5,
      attributes: { k: "v" },
      status: "ok",
    })
  })

  it("withSpan marks errors and rethrows", async () => {
    const exporter = createMemoryExporter()
    const tracer = createTracer({ exporter })
    await expect(
      // biome-ignore lint/suspicious/useAwait: callback just throws
      tracer.withSpan("boom", async () => {
        throw new Error("nope")
      }),
    ).rejects.toThrow("nope")
    expect(exporter.spans[0]?.status).toBe("error")
  })

  it("throws if a span is ended twice", () => {
    const tracer = createTracer()
    const span = tracer.startSpan("x")
    span.end()
    expect(() => span.end()).toThrow(/already ended/)
  })
})

describe("traceAgentRun", () => {
  it("emits a root span plus a span per tool call", async () => {
    // A hand-crafted event stream exercises the bridge without a real tool set:
    // iteration → toolCall → toolResult → iteration → done.
    const result: AgentResult = {
      text: "done",
      response: {
        content: [],
        stopReason: "end_turn",
        usage: { inputTokens: 0, outputTokens: 3 },
        model: "m",
      },
      usage: { inputTokens: 0, outputTokens: 3 },
      iterations: 2,
      stopReason: "end_turn",
      transcript: [],
    }
    const agent: StreamableAgent = {
      // biome-ignore lint/suspicious/useAwait: async generator for test agent
      async *stream() {
        yield { type: "iteration", iteration: 1 }
        yield { type: "toolCall", id: "c1", name: "noop", input: {} }
        yield { type: "toolResult", id: "c1", name: "noop", content: "ok", isError: false }
        yield { type: "iteration", iteration: 2 }
        yield { type: "text", delta: "done" }
        yield { type: "done", result }
        return result
      },
    }
    const exporter = createMemoryExporter()
    const tracer = createTracer({ exporter })

    const out = await traceAgentRun(agent, "go", tracer)
    expect(out.text).toBe("done")

    const names = exporter.spans.map((s) => s.name)
    expect(names).toContain("agent.run")
    expect(names).toContain("tool noop")
    expect(names).toContain("iteration 1")
    expect(names).toContain("iteration 2")
    // root span carries run-level attributes
    const root = exporter.spans.find((s) => s.name === "agent.run")
    expect(root?.attributes.stopReason).toBe("end_turn")
    expect(root?.attributes.iterations).toBe(2)
  })
})
