import { createAgent } from "vibe/agent"
import { createAnthropicProvider } from "vibe/model"
import { defineTool } from "vibe/tools"
import { z } from "zod"

const weather = defineTool({
  name: "get_weather",
  description: "Get the weather for a city.",
  schema: z.object({ city: z.string() }),
  execute: ({ city }) => `It's sunny and 22°C in ${city}.`,
})

const agent = createAgent({ provider: createAnthropicProvider(), tools: [weather] })
const result = await agent.run("What's the weather in Lisbon?")
console.log(result.text)
console.log(`(${result.iterations} iterations, stop=${result.stopReason})`)
