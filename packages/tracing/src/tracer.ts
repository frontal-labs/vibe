import type { ActiveSpan, Span, Tracer, TracerOptions } from "./types"

let counter = 0
const nextId = () => `span_${(++counter).toString(36)}`

/** Create a tracer. Without an exporter, finished spans are dropped after `end()`. */
export function createTracer(options: TracerOptions = {}): Tracer {
  const now = options.now ?? (() => Date.now())
  const exporter = options.exporter

  function startSpan(name: string, parent?: string): ActiveSpan {
    const id = nextId()
    const startMs = now()
    const attributes: Record<string, unknown> = {}
    let status: "ok" | "error" = "ok"
    let ended = false

    return {
      id,
      setAttribute(key, value) {
        attributes[key] = value
      },
      setStatus(next) {
        status = next
      },
      end(): Span {
        if (ended) {
          throw new Error(`Span "${name}" already ended`)
        }
        ended = true
        const endMs = now()
        const span: Span = {
          id,
          parentId: parent,
          name,
          startMs,
          endMs,
          durationMs: endMs - startMs,
          attributes,
          status,
        }
        exporter?.export(span)
        return span
      },
    }
  }

  return {
    startSpan,
    async withSpan(name, fn, parent) {
      const span = startSpan(name, parent)
      try {
        return await fn(span)
      } catch (error) {
        span.setStatus("error")
        span.setAttribute("error", error instanceof Error ? error.message : String(error))
        throw error
      } finally {
        span.end()
      }
    },
  }
}
