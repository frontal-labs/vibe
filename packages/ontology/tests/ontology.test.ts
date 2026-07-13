import { runToolCall } from "@vibe/tools"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { defineEntity } from "../src/entity"
import { createEntityRegistry } from "../src/registry"
import { createRetrieveTool, retrieveContext } from "../src/retrieve-tool"
import { createInMemoryOntologyStore } from "../src/store"

describe("defineEntity", () => {
  const Customer = defineEntity("Customer", z.object({ id: z.string(), name: z.string() }))

  it("carries a version and JSON schema, and validates records", async () => {
    expect(Customer.version).toBe(1)
    expect(Customer.jsonSchema).toMatchObject({ type: "object" })

    const ok = await Customer.validate({ id: "c1", name: "Ada" })
    expect(ok).toEqual({ ok: true, value: { id: "c1", name: "Ada" } })

    const bad = await Customer.validate({ id: "c1" })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.issues.length).toBeGreaterThan(0)
  })
})

describe("createEntityRegistry", () => {
  it("addresses entities by name and version, returning the latest by default", () => {
    const v1 = defineEntity("Invoice", z.object({ id: z.string() }), { version: 1 })
    const v2 = defineEntity("Invoice", z.object({ id: z.string(), total: z.number() }), {
      version: 2,
    })
    const registry = createEntityRegistry([v1, v2])

    expect(registry.versions("Invoice")).toEqual([1, 2])
    expect(registry.get("Invoice")?.version).toBe(2)
    expect(registry.get("Invoice", 1)?.version).toBe(1)
    expect(Object.keys(registry.toJSONSchema())).toEqual(["Invoice"])
  })

  it("rejects a duplicate name+version", () => {
    const e = defineEntity("X", z.object({}))
    expect(() => createEntityRegistry([e, e])).toThrow(/already registered/)
  })
})

describe("createInMemoryOntologyStore", () => {
  it("retrieves the most similar record and honors entity filters", async () => {
    const store = createInMemoryOntologyStore()
    await store.upsert({ id: "a", entity: "Doc", data: {}, text: "billing refunds and invoices" })
    await store.upsert({ id: "b", entity: "Doc", data: {}, text: "shipping and delivery times" })
    await store.upsert({ id: "c", entity: "Note", data: {}, text: "refund policy details" })

    const hits = await store.retrieve("how do refunds work", { limit: 2 })
    expect(hits[0]?.record.id).toBeDefined()
    expect(hits.map((h) => h.record.id)).toContain("a")

    const notesOnly = await store.retrieve("refund", { entity: "Note" })
    expect(notesOnly.every((h) => h.record.entity === "Note")).toBe(true)
  })

  it("stores and traverses relations", async () => {
    const store = createInMemoryOntologyStore()
    await store.upsert({ id: "order1", entity: "Order", data: {} })
    await store.upsert({ id: "cust1", entity: "Customer", data: {} })
    await store.relate("order1", "placed_by", "cust1")

    const related = await store.related("order1", "placed_by")
    expect(related.map((r) => r.id)).toEqual(["cust1"])
  })
})

describe("retrieve tool + context", () => {
  it("formats grounding context and runs as a tool", async () => {
    const store = createInMemoryOntologyStore()
    await store.upsert({
      id: "k1",
      entity: "KB",
      data: {},
      text: "reset your password from settings",
    })

    const context = await retrieveContext(store, "password reset")
    expect(context).toContain("reset your password")

    const tool = createRetrieveTool(store)
    expect(tool.name).toBe("ontology_retrieve")
    const result = await runToolCall(tool, { query: "password reset" })
    expect(result.content).toContain("reset your password")
    expect(result.isError).toBeFalsy()
  })
})
