/** The span shape this exporter reads — structurally satisfied by `vibe/tracing`. */
export interface SpanLike {
  readonly id: string
  readonly parentId: string | undefined
  readonly name: string
  readonly startMs: number
  readonly endMs: number
  readonly attributes: Readonly<Record<string, unknown>>
  readonly status: "ok" | "error"
}

/** An OTLP-shaped span record (the subset most collectors accept). */
export interface OTLPSpan {
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId?: string
  readonly name: string
  readonly startTimeUnixNano: number
  readonly endTimeUnixNano: number
  readonly attributes: Array<{ key: string; value: { stringValue: string } }>
  readonly status: { code: number }
}

/** Convert a tracer span into an OTLP span record. */
export function toOTLPSpan(span: SpanLike, traceId = span.id): OTLPSpan {
  return {
    traceId,
    spanId: span.id,
    parentSpanId: span.parentId,
    name: span.name,
    startTimeUnixNano: Math.round(span.startMs * 1e6),
    endTimeUnixNano: Math.round(span.endMs * 1e6),
    attributes: Object.entries(span.attributes).map(([key, value]) => ({
      key,
      value: { stringValue: String(value) },
    })),
    // OTLP status codes: 1 = OK, 2 = ERROR.
    status: { code: span.status === "error" ? 2 : 1 },
  }
}

/**
 * A `SpanExporter`-compatible OTLP exporter. `send` receives each converted span
 * (POST it to an OTLP/HTTP collector, or buffer/batch as needed).
 */
export function createOTLPExporter(send: (span: OTLPSpan) => void) {
  return {
    export(span: SpanLike): void {
      send(toOTLPSpan(span))
    },
  }
}
