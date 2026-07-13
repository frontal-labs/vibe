import { createAgent, createDelegateTool } from "vibe/agent"
import { createAnthropicProvider } from "vibe/model"

// A worker sub-agent, exposed to the coordinator as a `delegate` tool. Pair workers
// with a cheaper model (e.g. `claude-haiku-4-5`) for fan-out.
const delegate = createDelegateTool({
  provider: createAnthropicProvider(),
  name: "compute",
  description: "Delegate a computation to a specialized worker.",
})

const coordinator = createAgent({ provider: createAnthropicProvider(), tools: [delegate] })
console.log((await coordinator.run("Compute 6 * 7 using your worker.")).text)
