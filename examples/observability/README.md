# observability

Wrap an agent with `observeAgent` and get metrics, an audit trail, and per-run cost
for free — no changes to the agent or its tools.

```sh
bun install
ANTHROPIC_API_KEY=sk-... bun run --filter @example/observability start
```

What it shows:

- **`observeAgent(agent, { metrics, audit }, { actor })`** — tees every run's events
  into recorders: tool-call/error counters, iteration + token histograms, USD cost,
  and an audit entry per tool call and per completion, all tagged with a correlation id.
- **`metrics.snapshot()`** — counters + histograms an exporter scrapes.
- **`costOf(usage, model)`** — priced from the model catalog. (`createOTLPExporter`
  converts tracer spans to OTLP for a collector.)
