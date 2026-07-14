# Defining tools with Zod

One Zod schema types the handler **and** the model-facing JSON Schema.

```ts
import { defineTool } from "frontal-vibe/tools"
import { z } from "zod"

export const getWeather = defineTool({
  name: "get_weather",
  description: "Get the weather for a city.",
  schema: z.object({ city: z.string() }),
  execute: ({ city }) => `Sunny in ${city}.`, // `city` is typed as string
})
```

Pass tools to `createAgent({ provider, tools: [getWeather] })`. Thrown errors and
invalid input come back as `isError` results, so the model can recover.
Runnable: [`examples/tool-use`](../examples/tool-use).
