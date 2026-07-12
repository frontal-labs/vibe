// Micro-benchmark for the agent loop over the deterministic fake provider.
// Run with: bun x vitest bench tools/profiling/agent-loop.bench.ts
import { createAgent } from "@vibe/agent"
import { createFakeProvider } from "@vibe/model"
import { bench, describe } from "vitest"

describe("agent loop", () => {
  bench("single text turn (fake provider)", async () => {
    const provider = createFakeProvider([{ content: [{ type: "text", text: "hi" }] }])
    await createAgent({ provider }).run("hello")
  })
})
