import { toSseStream } from "./sse"
import type { AgentLike, AskRequestBody, HttpAdapterOptions } from "./types"

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })
}

/**
 * Adapt an agent to a Web-standard `(Request) => Promise<Response>` handler —
 * works in Bun, edge runtimes, Next.js route handlers, and Hono. POST a JSON body
 * `{ prompt }`; add `{ stream: true }` (or `?stream=1`) for an SSE event stream.
 */
export function toFetchHandler(agent: AgentLike, options: HttpAdapterOptions = {}) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    if (options.path && url.pathname !== options.path) {
      return json({ error: "Not found" }, 404)
    }
    if (request.method !== "POST") {
      return json({ error: "Method not allowed. POST a JSON body { prompt }." }, 405)
    }

    let body: AskRequestBody
    try {
      body = (await request.json()) as AskRequestBody
    } catch {
      return json({ error: "Invalid JSON body." }, 400)
    }

    const prompt = body.prompt ?? body.text
    if (typeof prompt !== "string" || prompt.length === 0) {
      return json({ error: "Missing 'prompt' (string) in body." }, 400)
    }

    const wantsStream = body.stream === true || url.searchParams.get("stream") === "1"
    if (wantsStream) {
      return new Response(toSseStream(agent, prompt), {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        },
      })
    }

    const result = await agent.run({ text: prompt })
    return json({
      text: result.text,
      iterations: result.iterations,
      stopReason: result.stopReason,
      usage: result.usage,
    })
  }
}
