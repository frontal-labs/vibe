# vibe/observability

Audit logging, metrics, and OpenTelemetry export for Vibe apps.

## What it does

Captures `AuditLog`s (`createAuditLog`, `createConsoleAuditSink`), collects
`Metrics` (`createMetrics`, `costOf`), observes agent runs (`observeAgent`), and
exports spans in OTLP format (`createOTLPExporter`, `toOTLPSpan`).

## Install

```sh
bun add vibe/observability
```

## Usage

```ts
import { createMetrics, createAuditLog, costOf } from "vibe/observability"

const metrics = createMetrics()
const audit = createAuditLog([createConsoleAuditSink()])
metrics.record("tokens", costOf(result))
```
