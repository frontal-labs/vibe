import type { IncomingMessage, ServerResponse } from "node:http"

import { toFetchHandler } from "./fetch"
import type { AgentLike, HttpAdapterOptions } from "./types"

/**
 * Adapt an agent to a Node `http.Server` / Express-style `(req, res)` listener,
 * bridging Node's streams to the Web-standard handler. Mount with
 * `http.createServer(toNodeListener(agent))` or `app.use(toNodeListener(agent))`.
 */
export function toNodeListener(agent: AgentLike, options: HttpAdapterOptions = {}) {
  const handler = toFetchHandler(agent, options)
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const chunks: Buffer[] = []
    // `IncomingMessage` is an async iterable of chunks (Node ≥ 10); annotate it so
    // the type-checker agrees regardless of the ambient lib settings.
    for await (const chunk of req as unknown as AsyncIterable<Buffer>) {
      chunks.push(chunk)
    }
    const request = new Request(`http://localhost${req.url ?? "/"}`, {
      method: req.method ?? "GET",
      headers: req.headers as Record<string, string>,
      body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
    })

    const response = await handler(request)
    res.statusCode = response.status
    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })

    if (response.body) {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        res.write(chunk)
      }
      res.end()
    } else {
      res.end(await response.text())
    }
  }
}
