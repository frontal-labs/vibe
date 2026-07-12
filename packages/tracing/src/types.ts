/** A finished span: a timed, attributed unit of work, optionally nested. */
export interface Span {
  readonly id: string
  readonly parentId: string | undefined
  readonly name: string
  readonly startMs: number
  readonly endMs: number
  readonly durationMs: number
  readonly attributes: Readonly<Record<string, unknown>>
  readonly status: "ok" | "error"
}

/** A live span handle. Call `end()` once; attributes can be set until then. */
export interface ActiveSpan {
  setAttribute(key: string, value: unknown): void
  setStatus(status: "ok" | "error"): void
  end(): Span
  readonly id: string
}

/** A sink for finished spans (console, OTLP, in-memory, …). */
export interface SpanExporter {
  export(span: Span): void
}

export interface TracerOptions {
  /** Where finished spans go. Defaults to an in-memory collector. */
  readonly exporter?: SpanExporter
  /** Monotonic clock in ms; injectable for deterministic tests. */
  readonly now?: () => number
}

/** Creates spans and routes finished ones to the exporter. */
export interface Tracer {
  startSpan(name: string, parent?: string): ActiveSpan
  /** Time an async fn as a span; records error status and rethrows on throw. */
  withSpan<T>(name: string, fn: (span: ActiveSpan) => Promise<T>, parent?: string): Promise<T>
}
