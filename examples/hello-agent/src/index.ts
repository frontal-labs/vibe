import { vibe } from "@vibe/core"
import { createAnthropicProvider, createFakeProvider } from "@vibe/model"

// Use the real Anthropic API when a key is present; otherwise a deterministic fake.
const provider = process.env.ANTHROPIC_API_KEY
  ? createAnthropicProvider()
  : createFakeProvider([{ content: [{ type: "text", text: "Hello from Vibe!" }] }])

const system = vibe.system({ name: "hello", provider })
await system.start()
console.log(await system.ask("Say hello."))
await system.stop()
