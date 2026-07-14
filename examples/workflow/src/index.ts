import {
  createMemoryCheckpointStore,
  defineWorkflow,
  parallel,
  runWorkflow,
  step,
} from "frontal-vibe/workflows"

// ── A code-first DAG: fetch → (summarize ‖ classify) → assemble ────────────────
const triage = defineWorkflow({
  name: "triage",
  steps: [
    step("fetch", (id: string) => ({ id, body: `ticket ${id}: my order never arrived` })),
    parallel("analyze", [
      step("summary", (t: { body: string }) => `${t.body.slice(0, 20)}…`),
      step("category", (t: { body: string }) => (t.body.includes("order") ? "orders" : "general")),
    ]),
    step("assemble", (analysis: Record<string, unknown>, ctx) => ({
      ticket: ctx.steps.fetch,
      ...analysis,
    })),
  ],
})

const result = await runWorkflow(triage, {
  input: "T-42",
  onEvent: (e) => e.type === "step:complete" && console.log(`✓ ${e.step}`),
})
console.log("status:", result.status)
console.log("output:", JSON.stringify(result.output))

// ── Durability: a step fails, we resume from the checkpoint and finish ─────────
// Reusing the same runId + store skips already-completed steps.
const store = createMemoryCheckpointStore()
let attempts = 0
const flaky = defineWorkflow({
  name: "flaky",
  steps: [
    step("prepare", () => "prepared"),
    step("commit", () => {
      attempts += 1
      if (attempts === 1) throw new Error("transient failure")
      return "committed"
    }),
  ],
})

const runId = "demo-run"
const first = await runWorkflow(flaky, { runId, store, input: null })
console.log(`\nfirst attempt: ${first.status}`) // failed — "commit" threw
const resumed = await runWorkflow(flaky, { runId, store, input: null })
console.log(`resumed:       ${resumed.status} → ${resumed.output}`) // "prepare" skipped
