import { createAgent } from "frontal-vibe/agent"
import { createAnthropicProvider } from "frontal-vibe/model"

const agent = createAgent({ provider: createAnthropicProvider() })

// `stream()` yields the agent's events as they happen. Text/thinking arrive as
// deltas; tool calls and the final result come through the same channel.
for await (const event of agent.stream("Stream something.")) {
  switch (event.type) {
    case "text":
      process.stdout.write(event.delta)
      break
    case "thinking":
      process.stdout.write(`\x1b[2m${event.delta}\x1b[0m`) // dim
      break
    case "toolCall":
      console.log(`\n[tool: ${event.name}(${JSON.stringify(event.input)})]`)
      break
    case "done":
      console.log(`\n[done: ${event.result.iterations} iterations, ${event.result.stopReason}]`)
      break
    default:
      break
  }
}
