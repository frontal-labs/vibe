import { createAgent } from "vibe/agent"
import { createFakeProvider } from "vibe/model"
import { defineTool } from "vibe/tools"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createAuditLog } from "../src/audit"
import { createMetrics } from "../src/metrics"
import { observeAgent } from "../src/observe-agent"

const ping = defineTool({
  name: "ping",
  description: "d",
  schema: z.object({}),
  execute: () => "pong",
})

// A provider that calls a tool on the first turn, then finishes.
function toolThenDone() {
  return createFakeProvider([
    { content: [{ type: "toolUse", id: "1", name: "ping", input: {} }] },
    { content: [{ type: "text", text: "done" }], usage: { outputTokens: 7 } },
  ])
}

function services() {
  return { metrics: createMetrics(), audit: createAuditLog() }
}

describe("observeAgent", () => {
  it("records tool calls, tokens and audit entries on run", async () => {
    const svc = services()
    const agent = observeAgent(createAgent({ provider: toolThenDone(), tools: [ping] }), svc, {
      actor: "svc",
    })
    await agent.run("hi")

    const snap = svc.metrics.snapshot()
    expect(snap.counters["tool.calls"]).toBe(1)
    expect(snap.histograms["tokens.output"]?.sum).toBe(7)
    expect(snap.histograms["cost.usd"]).toBeDefined()
    const actions = svc.audit.entries().map((e) => e.action)
    expect(actions).toContain("tool.call")
    expect(actions).toContain("agent.done")
    expect(svc.audit.entries().every((e) => e.actor === "svc")).toBe(true)
  })

  it("records the same signals when consumed via stream", async () => {
    const svc = services()
    const agent = observeAgent(createAgent({ provider: toolThenDone(), tools: [ping] }), svc)
    for await (const _ of agent.stream("hi")) {
      // drain
    }
    expect(svc.metrics.snapshot().counters["tool.calls"]).toBe(1)
    expect(svc.audit.entries().some((e) => e.action === "agent.done")).toBe(true)
  })

  it("still calls a caller-supplied onEvent", async () => {
    const svc = services()
    const seen: string[] = []
    const agent = observeAgent(createAgent({ provider: toolThenDone(), tools: [ping] }), svc)
    await agent.run("hi", { onEvent: (e) => seen.push(e.type) })
    expect(seen).toContain("toolCall")
    expect(seen).toContain("done")
  })
})
