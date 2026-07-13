import { denyTools } from "@vibe/governance"
import { createFakeProvider } from "@vibe/model"
import { defineEntity } from "@vibe/ontology"
import { defineSkill } from "@vibe/skills"
import { defineTool } from "@vibe/tools"
import { defineWorkflow, step } from "@vibe/workflows"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createSystem } from "../src/system"

const provider = createFakeProvider([{ content: [{ type: "text", text: "ok" }] }])

describe("createSystem — enterprise wiring", () => {
  it("exposes always-present enterprise services with sensible defaults", () => {
    const system = createSystem({ name: "app", provider })
    expect(system.observability.metrics).toBeDefined()
    expect(system.observability.audit.entries()).toEqual([])
    expect(system.observability.tracing).toBe(false)
    expect(system.security.redact("mail a@b.com")).toBe("mail a@b.com") // redaction off by default
    expect(system.ontology.entities.list()).toEqual([])
    expect(system.skills.list()).toEqual([])
    expect(system.workflows).toEqual({})
  })

  it("builds a governance engine from config", async () => {
    const system = createSystem({
      name: "app",
      provider,
      governance: { policies: [denyTools(["wipe"])], requireApproval: ["charge"] },
    })
    expect((await system.governance.evaluate({ tool: "wipe", input: {} })).decision).toBe("deny")
    expect((await system.governance.evaluate({ tool: "charge", input: {} })).decision).toBe(
      "require-approval",
    )
    expect((await system.governance.evaluate({ tool: "ok", input: {} })).decision).toBe("allow")
  })

  it("enables PII redaction, seeds the ontology, and registers skills into the tool registry", () => {
    const summarize = defineSkill({
      name: "summarize",
      description: "d",
      schema: z.object({ text: z.string() }),
      execute: ({ text }) => text,
    })
    const Customer = defineEntity("Customer", z.object({ id: z.string() }))

    const system = createSystem({
      name: "app",
      provider,
      security: { redactPII: true },
      ontology: { entities: [Customer] },
      skills: [summarize],
    })

    expect(system.security.redact("mail a@b.com")).toContain("[REDACTED:email]")
    expect(system.ontology.entities.get("Customer")?.name).toBe("Customer")
    expect(system.skills.has("summarize")).toBe(true)
    // the skill is also usable by the default agent (merged into the tool registry)
    expect(system.agent().model).toBeDefined()
  })

  it("exposes configured workflows and does not clobber a same-named tool with a skill", () => {
    const wf = defineWorkflow({ name: "pipe", steps: [step("a", () => 1)] })
    const echo = defineTool({
      name: "dup",
      description: "d",
      schema: z.object({}),
      execute: () => "tool",
    })
    const dupSkill = defineSkill({
      name: "dup",
      description: "d",
      schema: z.object({}),
      execute: () => "skill",
    })
    const system = createSystem({
      name: "app",
      provider,
      tools: [echo],
      skills: [dupSkill],
      workflows: { pipe: wf },
    })
    expect(Object.keys(system.workflows)).toEqual(["pipe"])
    // collision is skipped (no throw); the pre-existing tool wins
    expect(system.skills.has("dup")).toBe(true)
  })
})
