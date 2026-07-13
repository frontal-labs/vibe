import { vibe } from "vibe/core"
import { createAnthropicProvider } from "vibe/model"
import { defineSkill, loadMarkdownSkill } from "vibe/skills"
import { z } from "zod"

// A "code" skill: typed, validated, and callable exactly like a tool — plus
// discovery metadata (tags/examples).
const wordCount = defineSkill({
  name: "word_count",
  description: "Count the words in a text.",
  schema: z.object({ text: z.string() }),
  tags: ["text"],
  examples: [{ input: "one two three", output: "3" }],
  execute: ({ text }) => String(text.trim().split(/\s+/).filter(Boolean).length),
})

// A "procedure" skill: a markdown playbook (frontmatter + body). Its handler returns
// the body, so the full checklist enters context only when the model invokes it.
const triage = loadMarkdownSkill(`---
name: triage
description: Playbook for handling a support ticket.
tags: [support]
---
# Triage
1. Identify the customer's problem.
2. Check the order status.
3. Offer the next best action.
`)

// Skills passed to a system are registered into its tool registry, so the default
// agent can call them directly.
const system = vibe.system({
  name: "skilled",
  provider: createAnthropicProvider(),
  skills: [wordCount, triage],
})
await system.start()

console.log(
  "registered:",
  system.skills
    .list()
    .map((s) => `${s.name} (${s.meta.kind})`)
    .join(", "),
)
console.log(await system.ask("How many words are in 'one two three'?"))
await system.stop()
