import type { AgentLike } from "vibe/adapters"
import { toFetchHandler } from "vibe/adapters"

import type { LambdaHttpEvent, LambdaHttpResult } from "./types"

/**
 * A Cloudflare Workers module: `export default toCloudflareWorker(agent)`.
 * Workers speak the Web fetch API directly, so this is the fetch handler.
 */
export function toCloudflareWorker(agent: AgentLike): {
  fetch: (request: Request) => Promise<Response>
} {
  return { fetch: toFetchHandler(agent) }
}

/** A Vercel / Next.js route handler (Web-standard `Request → Response`). */
export function toVercelHandler(agent: AgentLike): (request: Request) => Promise<Response> {
  return toFetchHandler(agent)
}

/**
 * An AWS Lambda (Function URL / API Gateway v2) handler. Maps the event to a
 * `Request`, runs the agent, and maps the `Response` back. Streaming responses are
 * buffered into the result body.
 */
export function toLambdaHandler(
  agent: AgentLike,
): (event: LambdaHttpEvent) => Promise<LambdaHttpResult> {
  const handler = toFetchHandler(agent)
  return async (event) => {
    const method = event.requestContext?.http?.method ?? "GET"
    const path = event.rawPath ?? "/"
    const query = event.rawQueryString ? `?${event.rawQueryString}` : ""
    const body =
      event.body === undefined
        ? undefined
        : event.isBase64Encoded
          ? Buffer.from(event.body, "base64")
          : event.body
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(event.headers ?? {})) {
      if (value !== undefined) headers[key] = value
    }

    const request = new Request(`https://lambda.local${path}${query}`, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : body,
    })
    const response = await handler(request)
    const outHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      outHeaders[key] = value
    })
    return { statusCode: response.status, headers: outHeaders, body: await response.text() }
  }
}
