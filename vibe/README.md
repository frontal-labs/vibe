# @frontal-labs/vibe

The barrel package for **Vibe** — a TypeScript framework for building reliable enterprise agentic
systems, by [Frontal](https://frontal.dev).

Install once and import everything from `@frontal-labs/vibe` or its subpaths, instead of the individual
`vibe/*` packages.

```bash
npm install @frontal-labs/vibe
# or: bun add @frontal-labs/vibe / pnpm add @frontal-labs/vibe
```

## Quick start

```ts
import { createAgent } from "@frontal-labs/vibe/agent"
import { createAnthropicProvider } from "@frontal-labs/vibe/model"
import { defineTool } from "@frontal-labs/vibe/tools"
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

`@frontal-labs/vibe/agent` · `/tools` · `/model` · `/memory` · `/core` · `/runtime` · `/config` ·
`/workflows` · `/skills` · `/ontology` · `/governance` · `/security` · `/observability` ·
`/evals` · `/plugin` · `/di` · `/adapters` · `/tracing` · `/errors` · `/logger` · `/deploy` ·
`/devtools`

Each corresponds to a `vibe/*` package; import from the scoped packages directly if you prefer a
narrower dependency surface.

## License

[Apache-2.0](./LICENSE.md)
