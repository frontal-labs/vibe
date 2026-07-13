import { describe, expect, it } from "vitest"

import { createAuditLog } from "../src/audit"
import { costOf } from "../src/cost"
import { createMetrics } from "../src/metrics"
import { createOTLPExporter, toOTLPSpan } from "../src/otlp"

describe("metrics", () => {
  it("aggregates counters and histograms", () => {
    const m = createMetrics()
    m.increment("tool.calls")
    m.increment("tool.calls", 2)
    m.observe("latency", 100)
    m.observe("latency", 300)
    const snap = m.snapshot()
    expect(snap.counters["tool.calls"]).toBe(3)
    expect(snap.histograms.latency).toEqual({ count: 2, sum: 400, min: 100, max: 300, avg: 200 })
  })
})

describe("audit log", () => {
  it("records immutable entries with correlation ids and mirrors to a sink", () => {
    const written: unknown[] = []
    const audit = createAuditLog(
      { write: (e) => written.push(e) },
      () => "2026-07-12T00:00:00.000Z",
    )
    const entry = audit.record({
      action: "tool.call",
      actor: "svc",
      correlationId: "req-1",
      detail: { tool: "charge" },
    })
    expect(entry.timestamp).toBe("2026-07-12T00:00:00.000Z")
    expect(audit.entries()).toHaveLength(1)
    expect(written).toHaveLength(1)
  })
})

describe("cost", () => {
  it("prices token usage from the model catalog", () => {
    const cost = costOf({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, "claude-opus-4-8")
    expect(cost.inputUsd).toBe(5)
    expect(cost.outputUsd).toBe(25)
    expect(cost.totalUsd).toBe(30)
  })

  it("unknown models cost 0", () => {
    expect(costOf({ inputTokens: 100, outputTokens: 100 }, "mystery").totalUsd).toBe(0)
  })
})

describe("OTLP exporter", () => {
  it("converts a tracer span to OTLP and forwards it", () => {
    const span = {
      id: "s1",
      parentId: "root",
      name: "tool charge",
      startMs: 1000,
      endMs: 1002,
      attributes: { tool: "charge", ok: true },
      status: "error" as const,
    }
    const otlp = toOTLPSpan(span)
    expect(otlp.spanId).toBe("s1")
    expect(otlp.parentSpanId).toBe("root")
    expect(otlp.status.code).toBe(2)
    expect(otlp.startTimeUnixNano).toBe(1_000_000_000)

    const sent: unknown[] = []
    createOTLPExporter((s) => sent.push(s)).export(span)
    expect(sent).toHaveLength(1)
  })
})
