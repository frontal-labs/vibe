import { describe, expect, it } from "vitest"

import { createAuditLog } from "../src/audit"
import { costOf } from "../src/cost"
import { createMetrics } from "../src/metrics"
import { createOTLPExporter, createOTLPHttpExporter, toOTLPSpan } from "../src/otlp"

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
    // OTLP ids are fixed-width hex; the mapping is deterministic, so parent links survive.
    expect(otlp.spanId).toMatch(/^[0-9a-f]{16}$/)
    expect(otlp.traceId).toMatch(/^[0-9a-f]{32}$/)
    expect(otlp.parentSpanId).toBe(toOTLPSpan({ ...span, id: "root", parentId: undefined }).spanId)
    expect(otlp.status.code).toBe(2)
    expect(otlp.startTimeUnixNano).toBe("1000000000")
    expect(otlp.attributes).toEqual([
      { key: "tool", value: { stringValue: "charge" } },
      { key: "ok", value: { boolValue: true } },
    ])

    const sent: unknown[] = []
    createOTLPExporter((s) => sent.push(s)).export(span)
    expect(sent).toHaveLength(1)
  })
})

describe("OTLP HTTP exporter", () => {
  const span = {
    id: "child",
    traceId: "run-1",
    parentId: "run-1",
    name: "tool charge",
    startMs: 10,
    endMs: 12,
    attributes: { attempts: 2 },
    status: "ok" as const,
  }

  it("batches spans and POSTs OTLP JSON to /v1/traces", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const exporter = createOTLPHttpExporter({
      endpoint: "http://collector:4318/",
      serviceName: "billing",
      headers: { authorization: "Bearer t" },
      // biome-ignore lint/suspicious/useAwait: interface requires Promise return
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init })
        return new Response("", { status: 200 })
      }) as typeof fetch,
    })
    exporter.export(span)
    exporter.export({ ...span, id: "other" })
    await exporter.flush()

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe("http://collector:4318/v1/traces")
    const body = JSON.parse(String(calls[0]?.init.body))
    const resource = body.resourceSpans[0].resource.attributes[0]
    expect(resource).toEqual({ key: "service.name", value: { stringValue: "billing" } })
    const [first, second] = body.resourceSpans[0].scopeSpans[0].spans
    expect(first.traceId).toBe(second.traceId)
    expect(first.parentSpanId).toBe(
      toOTLPSpan({ ...span, id: "run-1", parentId: undefined }).spanId,
    )
    expect(first.attributes).toEqual([{ key: "attempts", value: { intValue: "2" } }])
    const sentHeaders = calls[0]?.init.headers as Record<string, string>
    expect(sentHeaders.authorization).toBe("Bearer t")
  })

  it("reports failures to onError and never throws", async () => {
    const errors: unknown[] = []
    const exporter = createOTLPHttpExporter({
      endpoint: "http://down",
      onError: (e) => errors.push(e),
      fetch: (async () => new Response("", { status: 503 })) as typeof fetch,
    })
    exporter.export(span)
    await expect(exporter.flush()).resolves.toBeUndefined()
    expect(String(errors[0])).toContain("HTTP 503")
  })

  it("auto-flushes when the batch fills", async () => {
    let posted = 0
    const exporter = createOTLPHttpExporter({
      endpoint: "http://c",
      batchSize: 2,
      // biome-ignore lint/suspicious/useAwait: interface requires Promise return
      fetch: (async () => {
        posted++
        return new Response("", { status: 200 })
      }) as typeof fetch,
    })
    exporter.export(span)
    exporter.export({ ...span, id: "b" })
    await new Promise((r) => setTimeout(r, 0))
    expect(posted).toBe(1)
  })
})

describe("OTLP endpoint normalization", () => {
  it("strips every trailing slash before appending the traces path, in linear time", async () => {
    const urls: string[] = []
    // biome-ignore lint/suspicious/useAwait: fetch is async by contract
    const fetcher = (async (url: string) => {
      urls.push(url)
      return new Response("", { status: 200 })
    }) as typeof fetch
    const span = {
      id: "s",
      parentId: undefined,
      name: "n",
      startMs: 0,
      endMs: 1,
      attributes: {},
      status: "ok" as const,
    }
    for (const endpoint of [
      "http://c/",
      "http://c////",
      "http://c",
      `http://c/${"/".repeat(50_000)}`,
    ]) {
      const exporter = createOTLPHttpExporter({ endpoint, fetch: fetcher })
      exporter.export(span)
      await exporter.flush()
    }
    expect(urls).toEqual([
      "http://c/v1/traces",
      "http://c/v1/traces",
      "http://c/v1/traces",
      "http://c/v1/traces",
    ])
  })
})
