import { vibe } from "@frontal-labs/vibe/core"
import { createAnthropicProvider } from "@frontal-labs/vibe/model"

// Uses the Anthropic API — set ANTHROPIC_API_KEY in your environment.
const provider = createAnthropicProvider()

const system = vibe.system({ name: "hello", provider })
await system.start()
console.log(await system.ask("Say hello."))
await system.stop()
