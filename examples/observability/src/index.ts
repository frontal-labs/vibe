import { createAgent } from "@frontal-labs/vibe/agent"
import { createAnthropicProvider } from "@frontal-labs/vibe/model"
import {
  costOf,
  createAuditLog,
  createMetrics,
  observeAgent,
} from "@frontal-labs/vibe/observability"
import { defineTool } from "@frontal-labs/vibe/tools"
import { z } from "zod"

const lookup = defineTool({
  name: "lookup",
  description: "Look up a fact by key.",
  schema: z.object({ key: z.string() }),
  execute: ({ key }) => (key === "capital" ? "Paris" : "unknown"),
})

const metrics = createMetrics()
const audit = createAuditLog()

const base = createAgent({ provider: createAnthropicProvider(), tools: [lookup] })

// Wrap once — every run now records tool calls/errors, iterations, token usage, and
// USD cost to `metrics`, plus an audit trail (per tool call + final) with a
// correlation id. Works over both `run` and `stream`.
const agent = observeAgent(base, { metrics, audit }, { actor: "tenant-A" })
const result = await agent.run("What's the capital of France?")

console.log("answer: ", result.text)
console.log("metrics:", JSON.stringify(metrics.snapshot().counters))
console.log("cost:   ", `$${costOf(result.usage, result.response.model).totalUsd.toFixed(6)}`)
console.log(
  "audit:  ",
  audit
    .entries()
    .map((e) => e.action)
    .join(" → "),
)
