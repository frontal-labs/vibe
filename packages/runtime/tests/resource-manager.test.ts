import { describe, expect, it } from "vitest"

import { createResourceManager } from "../src/resource-manager"

describe("ResourceManager", () => {
  it("should acquire and release a resource", async () => {
    const rm = createResourceManager()
    const handle = await rm.acquire("test", 1)
    expect(rm.getUsage("test")).toEqual({ active: 1, max: 1, pending: 0 })
    handle.release()
    expect(rm.getUsage("test")).toEqual({ active: 0, max: 1, pending: 0 })
  })

  it("should queue when at capacity", async () => {
    const rm = createResourceManager()
    const handle1 = await rm.acquire("limited", 1)
    expect(rm.getUsage("limited").active).toBe(1)

    const acquirePromise = rm.acquire("limited", 1)
    expect(rm.getUsage("limited").pending).toBe(1)

    handle1.release()
    const handle2 = await acquirePromise
    expect(rm.getUsage("limited").active).toBe(1)
    expect(rm.getUsage("limited").pending).toBe(0)

    handle2.release()
    expect(rm.getUsage("limited").active).toBe(0)
  })

  it("should support multiple concurrent resources", async () => {
    const rm = createResourceManager()
    const h1 = await rm.acquire("pool", 3)
    const h2 = await rm.acquire("pool", 3)
    const h3 = await rm.acquire("pool", 3)

    expect(rm.getUsage("pool").active).toBe(3)

    h1.release()
    expect(rm.getUsage("pool").active).toBe(2)
    h2.release()
    h3.release()
    expect(rm.getUsage("pool").active).toBe(0)
  })

  it("should timeout when resource is not available", async () => {
    const rm = createResourceManager()
    const handle = await rm.acquire("timeout-test", 1)

    await expect(rm.acquire("timeout-test", 1, { timeoutMs: 10 })).rejects.toThrow("timed out")

    handle.release()
  })

  it("should return zero usage for unknown resources", () => {
    const rm = createResourceManager()
    expect(rm.getUsage("unknown")).toEqual({ active: 0, max: 0, pending: 0 })
  })
})
