import { describe, expect, it } from "vitest"

import { ContextStore } from "../src/context-store"

describe("ContextStore", () => {
  it("should provide value within run context", async () => {
    const store = new ContextStore<string>()
    const result = await store.run("hello", () => store.get())
    expect(result).toBe("hello")
  })

  it("should return undefined outside of run context", () => {
    const store = new ContextStore<string>()
    expect(store.get()).toBeUndefined()
  })

  it("should support nested contexts", async () => {
    const store = new ContextStore<string>()
    const result = await store.run("outer", async () => {
      const outer = store.get()
      const inner = await store.run("inner", () => store.get())
      return { outer, inner }
    })
    expect(result?.outer).toBe("outer")
    expect(result?.inner).toBe("inner")
  })

  it("should restore outer context after inner run completes", async () => {
    const store = new ContextStore<string>()
    const result = await store.run("outer", async () => {
      await store.run("inner", () => {})
      return store.get()
    })
    expect(result).toBe("outer")
  })

  it("should report has() correctly", () => {
    const store = new ContextStore<string>()
    expect(store.has()).toBe(false)
    store.enterWith("value")
    expect(store.has()).toBe(true)
  })

  it("should throw on getOrThrow when empty", () => {
    const store = new ContextStore<string>()
    expect(() => store.getOrThrow()).toThrow(TypeError)
    expect(() => store.getOrThrow("custom")).toThrow("custom")
  })

  it("should return value from getOrThrow when present", () => {
    const store = new ContextStore<string>()
    store.enterWith("val")
    expect(store.getOrThrow()).toBe("val")
  })

  it("should propagate exceptions from within run", async () => {
    const store = new ContextStore<string>()
    const error = new Error("test error")
    await expect(store.run("val", () => Promise.reject(error))).rejects.toThrow(error)
  })

  it("should propagate synchronous exceptions from within run", async () => {
    const store = new ContextStore<string>()
    const error = new Error("sync error")
    await expect(
      store.run("val", () => {
        throw error
      }),
    ).rejects.toThrow(error)
  })

  it("should handle concurrent runs", async () => {
    const store = new ContextStore<number>()
    const results = await Promise.all([
      store.run(1, () => store.get()),
      store.run(2, () => store.get()),
      store.run(3, () => store.get()),
    ])
    expect(results).toEqual([1, 2, 3])
  })

  it("should support disable", () => {
    const store = new ContextStore<string>()
    store.enterWith("val")
    expect(store.has()).toBe(true)
    store.disable()
    expect(store.has()).toBe(false)
  })
})
