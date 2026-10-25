import { expectType } from "tsd"

import {
  type AuditLog,
  createAuditLog,
  createMetrics,
  createOTLPHttpExporter,
  type Metrics,
  type MetricsSnapshot,
  type OTLPHttpExporter,
  type OTLPSpan,
  toOTLPSpan,
} from "../src/index"

const metrics = createMetrics()
expectType<Metrics>(metrics)
expectType<MetricsSnapshot>(metrics.snapshot())

expectType<AuditLog>(createAuditLog())

const span = toOTLPSpan({
  id: "s1",
  parentId: undefined,
  name: "run",
  startMs: 0,
  endMs: 1,
  attributes: {},
  status: "ok",
})
expectType<OTLPSpan>(span)
// The OTLP span id is 16 hex characters, so it is always a string.
expectType<string>(span.spanId)

expectType<OTLPHttpExporter>(createOTLPHttpExporter({ endpoint: "http://collector" }))
// @ts-expect-error: an endpoint is required
createOTLPHttpExporter({})
