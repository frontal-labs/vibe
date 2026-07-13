import { runToolCall } from "@vibe/tools"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { defineSkill } from "../src/define-skill"
import { loadMarkdownSkill, parseMarkdownSkill } from "../src/markdown"
import { createSkillRegistry } from "../src/registry"

describe("defineSkill", () => {
  it("produces a code skill that runs through runToolCall with validation", async () => {
    const refund = defineSkill({
      name: "refund",
      description: "Issue a refund",
      schema: z.object({ orderId: z.string(), amount: z.number() }),
      tags: ["billing"],
      execute: ({ orderId, amount }) => `refunded ${amount} for ${orderId}`,
    })
    expect(refund.meta).toEqual({ kind: "code", tags: ["billing"], examples: undefined })
    expect(refund.inputSchema).toMatchObject({ type: "object" })

    const ok = await runToolCall(refund, { orderId: "o1", amount: 5 })
    expect(ok).toEqual({ content: "refunded 5 for o1" })

    const bad = await runToolCall(refund, { orderId: "o1" })
    expect(bad.isError).toBe(true)
  })
})

describe("parseMarkdownSkill / loadMarkdownSkill", () => {
  const source = `---
name: escalate
description: Escalate a ticket to a human
tools: [lookup, notify]
tags: [support, urgent]
---
# Escalation procedure

1. Look up the ticket.
2. Notify the on-call engineer.`

  it("parses frontmatter and body", () => {
    const parsed = parseMarkdownSkill(source)
    expect(parsed.name).toBe("escalate")
    expect(parsed.description).toBe("Escalate a ticket to a human")
    expect(parsed.tools).toEqual(["lookup", "notify"])
    expect(parsed.tags).toEqual(["support", "urgent"])
    expect(parsed.body).toContain("Escalation procedure")
  })

  it("loads a procedure skill whose handler returns the body on demand", async () => {
    const skill = loadMarkdownSkill(source)
    expect(skill.meta.kind).toBe("procedure")
    const result = await runToolCall(skill, {})
    expect(result.content).toContain("Notify the on-call engineer.")
  })
})

describe("createSkillRegistry", () => {
  it("unifies code + procedure skills and exposes them as tools", () => {
    const code = defineSkill({
      name: "greet",
      description: "d",
      schema: z.object({ who: z.string() }),
      execute: ({ who }) => `hi ${who}`,
    })
    const proc = loadMarkdownSkill("---\nname: playbook\ndescription: p\n---\nbody")
    const registry = createSkillRegistry([code, proc])

    expect(registry.has("greet")).toBe(true)
    expect(registry.list("procedure").map((s) => s.name)).toEqual(["playbook"])
    expect(
      registry
        .toTools()
        .map((t) => t.name)
        .sort(),
    ).toEqual(["greet", "playbook"])
    expect(registry.toSchemas()).toHaveLength(2)
  })

  it("rejects duplicate skill names", () => {
    const a = defineSkill({ name: "x", description: "d", schema: z.object({}), execute: () => "" })
    expect(() => createSkillRegistry([a, a])).toThrow(/Duplicate skill name/)
  })
})
