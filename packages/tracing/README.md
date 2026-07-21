# vibe/tracing

Span-based tracing for agent runs with pluggable exporters.

## What it does

`createTracer` records `Span`s for agent execution; `traceAgentRun` bridges
agent events into traces. Exporters include `createConsoleExporter` and
`createMemoryExporter` (`MemoryExporter`). Spans can be emitted as OTLP via the
observability package.

## Install

```sh
bun add vibe/tracing
```

## Usage

```ts
import { createTracer, createMemoryExporter, traceAgentRun } from "vibe/tracing"

const exporter = createMemoryExporter()
const tracer = createTracer({ exporter })
await traceAgentRun(tracer, agent, { input: "go" })
```
