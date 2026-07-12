import type { Span, SpanExporter } from "./types"

/** Collects finished spans in memory — the default, and handy for tests/UIs. */
export interface MemoryExporter extends SpanExporter {
  readonly spans: readonly Span[]
  clear(): void
}

export function createMemoryExporter(): MemoryExporter {
  const spans: Span[] = []
  return {
    spans,
    export(span) {
      spans.push(span)
    },
    clear() {
      spans.length = 0
    },
  }
}

/** Prints one line per finished span. Pass a custom `write` to redirect output. */
export function createConsoleExporter(write: (line: string) => void = console.log): SpanExporter {
  return {
    export(span) {
      const status = span.status === "error" ? " ✗" : ""
      write(`[trace] ${span.name} ${span.durationMs}ms${status}`)
    },
  }
}
