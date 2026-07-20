import { toFetchHandler } from "@frontal-labs/vibe/adapters"
import { createAgent } from "@frontal-labs/vibe/agent"
import { createAnthropicProvider } from "@frontal-labs/vibe/model"

const provider = createAnthropicProvider()

const handler = toFetchHandler(createAgent({ provider }))
const port = Number(process.env.PORT ?? 3000)

// Bun.serve if available; otherwise fall back to Node's http.
// POST {"prompt":"..."}  — add {"stream":true} for SSE.
const bun = (globalThis as { Bun?: { serve: (o: unknown) => unknown } }).Bun
if (bun) {
  bun.serve({ port, fetch: handler })
  console.log(`Listening on http://localhost:${port} (POST { prompt })`)
} else {
  const { createServer } = await import("node:http")
  const { toNodeListener } = await import("@frontal-labs/vibe/adapters")
  createServer(toNodeListener(createAgent({ provider }))).listen(port, () =>
    console.log(`Listening on http://localhost:${port}`),
  )
}
