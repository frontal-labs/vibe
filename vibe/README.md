# @vibe/vibe

The barrel package for **Vibe** — a TypeScript framework for building reliable enterprise agentic
systems, by [Frontal](https://frontal.dev).

Install once and import everything from `@vibe/vibe` or its subpaths, instead of the individual
`vibe/*` packages.

```bash
npm install @vibe/vibe
# or: bun add @vibe/vibe / pnpm add @vibe/vibe
```

## Quick start

```ts
import { createAgent } from "@vibe/agent"
import { createAnthropicProvider } from "@vibe/model"
import { defineTool } from "@vibe/tools"
import { z } from "zod"

const getOrder = defineTool({
  name: "get_order",
  description: "Look up an order by id",
  schema: z.object({ id: z.string() }),
  execute: ({ id }) => lookupOrder(id),
})

const agent = createAgent({
  provider: createAnthropicProvider(),
  system: "You are a concise support agent.",
  tools: [getOrder],
})

const result = await agent.run("Where is order A-123?")
console.log(result.text)
```

## Subpath exports

Everything is available from a subpath, so you only pull in what you use:

`@vibe/agent` · `/tools` · `/model` · `/memory` · `/core` · `/runtime` · `/config` ·
`/workflows` · `/skills` · `/ontology` · `/governance` · `/security` · `/observability` ·
`/evals` · `/plugin` · `/di` · `/adapters` · `/tracing` · `/errors` · `/logger` · `/deploy` ·
`/devtools`

Each corresponds to a `vibe/*` package; import from the scoped packages directly if you prefer a
narrower dependency surface.

## License

[Apache-2.0](./LICENSE.md)
