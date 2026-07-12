import { createAgent, createDelegateTool } from "@vibe/agent"
import { createAnthropicProvider, createFakeProvider } from "@vibe/model"

// A worker sub-agent, exposed to the coordinator as a `delegate` tool.
const workerProvider = process.env.ANTHROPIC_API_KEY
  ? createAnthropicProvider()
  : createFakeProvider([{ content: [{ type: "text", text: "42" }] }])
const delegate = createDelegateTool({
  provider: workerProvider,
  name: "compute",
  description: "Delegate a computation to a specialized worker.",
})

const coordinatorProvider = process.env.ANTHROPIC_API_KEY
  ? createAnthropicProvider()
  : createFakeProvider([
      { content: [{ type: "toolUse", id: "d1", name: "compute", input: { task: "6 * 7" } }] },
      { content: [{ type: "text", text: "The worker computed 42." }] },
    ])

const coordinator = createAgent({ provider: coordinatorProvider, tools: [delegate] })
console.log((await coordinator.run("Compute 6 * 7 using your worker.")).text)
