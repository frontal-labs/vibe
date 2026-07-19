import { toOpenAICompatHandler } from "vibe/adapters"
import { createAgent } from "vibe/agent"
import { createPolicyEngine, denyTools, guardTool } from "vibe/governance"
import { createFakeProvider } from "vibe/model"
import { costOf, createAuditLog, createMetrics } from "vibe/observability"
import { createInMemoryOntologyStore, createRetrieveTool } from "vibe/ontology"
import { redactPII } from "vibe/security"
import { defineSkill, loadMarkdownSkill } from "vibe/skills"
import { defineTool, runToolCall } from "vibe/tools"
import { defineWorkflow, runWorkflow, step } from "vibe/workflows"
import { describe, expect, it } from "vitest"
import { z } from "zod"

const agentSaying = (text: string) =>
  createAgent({ provider: createFakeProvider([{ content: [{ type: "text", text }] }]) })

describe("enterprise: OpenAI-compatible surface", () => {
  it("serves an agent behind /v1/chat/completions", async () => {
    const res = await toOpenAICompatHandler(agentSaying("hi from vibe"))(
      new Request("http://x/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "hey" }] }),
      }),
    )
    const body = (await res.json()) as {
      object: string
      choices: Array<{ message: { content: string } }>
    }
    expect(body.object).toBe("chat.completion")
    expect(body.choices[0].message.content).toBe("hi from vibe")
  })
})

describe("enterprise: skills unify code + markdown", () => {
  it("runs a typed skill and reads a markdown procedure", async () => {
    const refund = defineSkill({
      name: "refund",
      description: "refund",
      schema: z.object({ amount: z.number() }),
      execute: ({ amount }) => `refunded ${amount}`,
    })
    expect(await runToolCall(refund, { amount: 9 })).toEqual({ content: "refunded 9" })

    const proc = loadMarkdownSkill("---\nname: escalate\ndescription: d\n---\nCall the on-call.")
    expect((await runToolCall(proc, {})).content).toContain("Call the on-call.")
  })
})

describe("enterprise: governed, observed, grounded workflow", () => {
  it("composes ontology retrieval, governance, security and observability in a durable workflow", async () => {
    // Ontology: seed grounding context and expose a retrieval tool.
    const store = createInMemoryOntologyStore()
    await store.upsert({
      id: "kb1",
      entity: "KB",
      data: {},
      text: "refunds are processed within 5 business days",
    })
    const retrieve = createRetrieveTool(store)

    // Governance: deny a dangerous tool.
    const wipe = defineTool({
      name: "wipe",
      description: "danger",
      schema: z.object({}),
      execute: () => "wiped",
    })
    const engine = createPolicyEngine([denyTools(["wipe"])])
    const guardedWipe = guardTool(wipe, engine)

    // Observability: metrics + audit.
    const metrics = createMetrics()
    const audit = createAuditLog(undefined, () => "2026-07-12T00:00:00.000Z")

    const workflow = defineWorkflow({
      name: "support",
      steps: [
        step<string, string>("ground", async (query) => {
          const result = await runToolCall(retrieve, { query })
          metrics.increment("tool.calls")
          return result.content
        }),
        step<string, { blocked: boolean; context: string }>("govern", async (context) => {
          const result = await runToolCall(guardedWipe, {})
          audit.record({ action: "tool.call", detail: { tool: "wipe", isError: result.isError } })
          return { blocked: result.isError === true, context }
        }),
        step("redact", (input: { blocked: boolean; context: string }) => ({
          ...input,
          context: redactPII(`${input.context} contact a@b.com`).text,
        })),
      ],
    })

    const result = await runWorkflow(workflow, { input: "how long do refunds take?" })

    expect(result.status).toBe("completed")
    const output = result.output as { blocked: boolean; context: string }
    expect(output.blocked).toBe(true) // governance denied the wipe tool
    expect(output.context).toContain("5 business days") // ontology grounding reached the step
    expect(output.context).toContain("[REDACTED:email]") // security redacted PII
    expect(metrics.snapshot().counters["tool.calls"]).toBe(1)
    expect(audit.entries()).toHaveLength(1)
  })

  it("prices a run from token usage", () => {
    expect(costOf({ inputTokens: 1_000_000, outputTokens: 0 }, "claude-opus-4-8").totalUsd).toBe(5)
  })
})
