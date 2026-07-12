import type { AgentLike } from "./types"

/**
 * Turn an agent run into a Server-Sent Events stream: one SSE `event:` per
 * `AgentEvent` (text/thinking/toolCall/toolResult/done), a final `result` event
 * carrying the `AgentResult`, and an `error` event if the run throws.
 */
export function toSseStream(agent: AgentLike, prompt: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      try {
        const gen = agent.stream({ text: prompt })
        let next = await gen.next()
        while (!next.done) {
          send(next.value.type, next.value)
          next = await gen.next()
        }
        send("result", next.value)
      } catch (error) {
        send("error", { error: error instanceof Error ? error.message : String(error) })
      } finally {
        controller.close()
      }
    },
  })
}
