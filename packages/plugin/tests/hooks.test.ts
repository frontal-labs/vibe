import { describe, it, expect, vi } from "vitest"

import { createPluginHooks } from "../src/hooks"

describe("PluginHooks", () => {
  it("should execute named hooks", async () => {
    const hooks = createPluginHooks()
    const handler = vi.fn()

    hooks.on("my-hook", handler)
    await hooks.execute("my-hook", "arg1", "arg2")

    expect(handler).toHaveBeenCalledWith("arg1", "arg2")
  })

  it("should execute onBefore lifecycle hooks", async () => {
    const hooks = createPluginHooks()
    const handler = vi.fn()

    hooks.onBefore("start", handler)
    await hooks.executeBefore("start")

    expect(handler).toHaveBeenCalledOnce()
  })

  it("should execute onAfter lifecycle hooks", async () => {
    const hooks = createPluginHooks()
    const handler = vi.fn()

    hooks.onAfter("start", handler)
    await hooks.executeAfter("start")

    expect(handler).toHaveBeenCalledOnce()
  })

  it("should handle async handlers", async () => {
    const hooks = createPluginHooks()
    const order: number[] = []

    hooks.on("async", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      order.push(2)
    })
    hooks.on("async", () => {
      order.push(1)
    })

    await hooks.execute("async")
    expect(order).toEqual([1, 2])
  })

  it("should silently skip unregistered hooks", async () => {
    const hooks = createPluginHooks()
    await expect(hooks.execute("nonexistent")).resolves.not.toThrow()
  })
})
