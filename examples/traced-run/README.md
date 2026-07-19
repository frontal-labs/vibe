# traced-run

Wrap an agent run in `traceAgentRun` and get a span tree — one span per iteration
and tool call — printed by the console exporter.

```sh
bun install
bun run --filter @example/traced-run start
```

`createTracer({ exporter })` with `createConsoleExporter()` prints spans; use
`createMemoryExporter()` to assert on them in tests, or `createOTLPExporter`
(from `vibe/observability`) to ship them to an OTLP collector.
