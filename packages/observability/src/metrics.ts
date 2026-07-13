export interface HistogramSnapshot {
  readonly count: number
  readonly sum: number
  readonly min: number
  readonly max: number
  readonly avg: number
}

export interface MetricsSnapshot {
  readonly counters: Readonly<Record<string, number>>
  readonly histograms: Readonly<Record<string, HistogramSnapshot>>
}

/**
 * A minimal in-process metrics registry: monotonic counters and value histograms
 * (tokens, latency, tool errors, cost). `snapshot()` is what an exporter scrapes.
 */
export interface Metrics {
  increment(name: string, by?: number): void
  observe(name: string, value: number): void
  snapshot(): MetricsSnapshot
}

export function createMetrics(): Metrics {
  const counters = new Map<string, number>()
  const histograms = new Map<string, number[]>()

  return {
    increment: (name, by = 1) => {
      counters.set(name, (counters.get(name) ?? 0) + by)
    },
    observe: (name, value) => {
      const values = histograms.get(name)
      if (values) values.push(value)
      else histograms.set(name, [value])
    },
    snapshot: () => {
      const hist: Record<string, HistogramSnapshot> = {}
      for (const [name, values] of histograms) {
        const sum = values.reduce((a, b) => a + b, 0)
        hist[name] = {
          count: values.length,
          sum,
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.length > 0 ? sum / values.length : 0,
        }
      }
      return { counters: Object.fromEntries(counters), histograms: hist }
    },
  }
}
