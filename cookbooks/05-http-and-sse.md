# Serving an agent over HTTP

```ts
import { toFetchHandler } from "vibe/adapters"

const handler = toFetchHandler(agent)   // (Request) => Promise<Response>
Bun.serve({ port: 3000, fetch: handler })
```

`POST { "prompt": "..." }` for JSON; add `?stream=1` (or `{ "stream": true }`) for a
Server-Sent Events stream. For Node use `toNodeListener(agent)`; for Next.js route
handlers, export `handler` directly. Runnable: [`examples/http-server`](../examples/http-server).
