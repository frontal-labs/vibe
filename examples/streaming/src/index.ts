import { createAgent } from "@vibe/agent"
import { createAnthropicProvider, createFakeProvider } from "@vibe/model"

const provider = process.env.ANTHROPIC_API_KEY
  ? createAnthropicProvider()
  : createFakeProvider([{ content: [{ type: "text", text: "Streaming, token by token." }] }])

const agent = createAgent({ provider })
for await (const event of agent.stream("Stream something.")) {
  if (event.type === "text") process.stdout.write(event.delta)
  if (event.type === "done") console.log(`\n[done: ${event.result.iterations} iterations]`)
}
