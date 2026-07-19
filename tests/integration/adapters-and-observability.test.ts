import { toFetchHandler } from "vibe/adapters"
import { createAgent } from "vibe/agent"
import { estimateCost, summarizeResult } from "vibe/devtools"
import { includes, runEval } from "vibe/evals"
import { createFakeProvider } from "vibe/model"
import { createMemoryExporter, createTracer, traceAgentRun } from "vibe/tracing"
import { describe, expect, it } from "vitest"

const agentSaying = (text: string) =>
  createAgent({ provider: createFakeProvider([{ content: [{ type: "text", text }] }]) })

describe("cross-package integration", () => {
  it("serves an agent over the HTTP adapter", async () => {
    const res = await toFetchHandler(agentSaying("served"))(
      new Request("http://x/", { method: "POST", body: JSON.stringify({ prompt: "hi" }) }),
    )
    expect(((await res.json()) as { text: string }).text).toBe("served")
  })

  it("traces a run into spans", async () => {
    const exporter = createMemoryExporter()
    const tracer = createTracer({ exporter })
    await traceAgentRun(agentSaying("traced"), "go", tracer)
    expect(exporter.spans.some((s) => s.name === "agent.run")).toBe(true)
  })

  it("evaluates and prices a run", async () => {
    const agent = agentSaying("Paris")
    const report = await runEval({
      cases: [{ name: "capital", input: "capital of France?", expected: "Paris" }],
      run: (input) => agent.run(input).then((r) => r.text),
      grader: includes(),
    })
    expect(report.passRate).toBe(1)

    const result = await agent.run("x")
    expect(estimateCost(result.usage, "claude-opus-4-8").totalUsd).toBeGreaterThanOrEqual(0)
    expect(summarizeResult(result)).toContain("stop=")
  })
})
