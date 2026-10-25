import { createHash } from "node:crypto"

/** The span shape this exporter reads — structurally satisfied by `vibe/tracing`. */
export interface SpanLike {
  readonly id: string
  /** Trace id shared by a run's spans. Defaults to the span's own id when absent. */
  readonly traceId?: string
  readonly parentId: string | undefined
  readonly name: string
  readonly startMs: number
  readonly endMs: number
  readonly attributes: Readonly<Record<string, unknown>>
  readonly status: "ok" | "error"
}

/** An OTLP attribute value (OpenTelemetry JSON encoding). 64-bit integers travel as strings. */
export type OTLPAnyValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string }
  | { doubleValue: number }

/** An OTLP-shaped span record, following the OpenTelemetry JSON encoding. */
export interface OTLPSpan {
  /** 32 lowercase hex characters. */
  readonly traceId: string
  /** 16 lowercase hex characters. */
  readonly spanId: string
  readonly parentSpanId?: string
  readonly name: string
  /** 1 = INTERNAL. Agent work is in-process, so every span is internal. */
  readonly kind: 1
  /** Nanoseconds since the Unix epoch, as a decimal string (uint64). */
  readonly startTimeUnixNano: string
  readonly endTimeUnixNano: string
  readonly attributes: ReadonlyArray<{ key: string; value: OTLPAnyValue }>
  readonly status: { code: 0 | 1 | 2 }
}

/**
 * Tracer ids are arbitrary strings, while OTLP requires fixed-width hex. A hash keeps the mapping
 * deterministic, so the same span always exports with the same id, and parent links stay intact.
 */
function hexId(input: string, bytes: number): string {
  return createHash("sha256")
    .update(input)
    .digest("hex")
    .slice(0, bytes * 2)
}

function toAnyValue(value: unknown): OTLPAnyValue {
  if (typeof value === "string") return { stringValue: value }
  if (typeof value === "boolean") return { boolValue: value }
  if (typeof value === "number") {
    return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value }
  }
  return { stringValue: JSON.stringify(value) ?? String(value) }
}

/** Milliseconds to nanoseconds as a decimal string, using BigInt so precision survives. */
function msToNanos(ms: number): string {
  return (BigInt(Math.round(ms)) * 1_000_000n).toString()
}

/** Convert a tracer span into an OTLP span record. */
export function toOTLPSpan(span: SpanLike, traceId = span.traceId ?? span.id): OTLPSpan {
  return {
    traceId: hexId(traceId, 16),
    spanId: hexId(span.id, 8),
    parentSpanId: span.parentId === undefined ? undefined : hexId(span.parentId, 8),
    name: span.name,
    kind: 1,
    startTimeUnixNano: msToNanos(span.startMs),
    endTimeUnixNano: msToNanos(span.endMs),
    attributes: Object.entries(span.attributes).map(([key, value]) => ({
      key,
      value: toAnyValue(value),
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

export interface OTLPHttpOptions {
  /** Collector base URL, e.g. `http://localhost:4318`. Spans are POSTed to `<endpoint>/v1/traces`. */
  endpoint: string
  /** Extra request headers, e.g. an auth token for a hosted collector. */
  headers?: Readonly<Record<string, string>>
  /** Value of the `service.name` resource attribute. */
  serviceName?: string
  /** Export as soon as this many spans are buffered. Default 64. */
  batchSize?: number
  /** Injectable for tests and custom transports. Defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** Called when an export fails. Telemetry failures never throw into the agent run. */
  onError?: (error: unknown) => void
}

export interface OTLPHttpExporter {
  export(span: SpanLike): void
  /** Send everything buffered. Call before shutdown so the last batch is not lost. */
  flush(): Promise<void>
}

/**
 * An OTLP/HTTP (JSON) exporter. It batches spans and POSTs them to a collector. Failures go to
 * `onError` and are dropped, because telemetry must never fail or slow the run it observes.
 */
export function createOTLPHttpExporter(options: OTLPHttpOptions): OTLPHttpExporter {
  const url = `${trimTrailingSlashes(options.endpoint)}/v1/traces`
  const batchSize = options.batchSize ?? 64
  const send = options.fetch ?? fetch
  const buffer: OTLPSpan[] = []

  async function flush(): Promise<void> {
    if (buffer.length === 0) return
    const spans = buffer.splice(0, buffer.length)
    const body = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: options.serviceName ?? "vibe" } },
            ],
          },
          scopeSpans: [{ scope: { name: "vibe" }, spans }],
        },
      ],
    }
    try {
      const response = await send(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...options.headers },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(`OTLP export failed: HTTP ${response.status}`)
    } catch (error) {
      options.onError?.(error)
    }
  }

  return {
    export(span) {
      buffer.push(toOTLPSpan(span))
      if (buffer.length >= batchSize) flush().catch(() => undefined)
    },
    flush,
  }
}

/**
 * Remove trailing slashes from a URL. A linear scan, not a regex: `/\/+$/` backtracks quadratically
 * on input made of many slashes, which is a denial-of-service risk for a configured endpoint.
 */
function trimTrailingSlashes(url: string): string {
  let end = url.length
  while (end > 0 && url.charAt(end - 1) === "/") end--
  return url.slice(0, end)
}
