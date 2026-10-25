import { describe, expect, it, vi } from "vitest"

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
    // Handlers execute in registration order; first handler is async but fully awaited
    expect(order).toEqual([2, 1])
  })

  it("should silently skip unregistered hooks", async () => {
    const hooks = createPluginHooks()
    await expect(hooks.execute("nonexistent")).resolves.toBeUndefined()
  })
})

describe("host.emit", () => {
  it("runs every handler for a name, in order, with the payload", async () => {
    const { createPluginHost } = await import("../src/host")
    const host = createPluginHost()
    const log: string[] = []
    await host.register({
      name: "p",
      version: "1.0.0",
      manifest: { name: "p", version: "1.0.0", description: "test" },
      setup(hooks) {
        hooks.on("custom:event", (payload) => {
          log.push(`a:${String(payload)}`)
        })
        hooks.on("custom:event", (payload) => {
          log.push(`b:${String(payload)}`)
        })
      },
    })
    await host.emit("custom:event", 7)
    expect(log).toEqual(["a:7", "b:7"])
  })

  it("rejects when a handler throws, so the emitting operation can fail", async () => {
    const { createPluginHost } = await import("../src/host")
    const host = createPluginHost()
    await host.register({
      name: "guard",
      version: "1.0.0",
      manifest: { name: "guard", version: "1.0.0", description: "test" },
      setup(hooks) {
        hooks.on("custom:event", () => {
          throw new Error("denied")
        })
      },
    })
    await expect(host.emit("custom:event", {})).rejects.toThrow("denied")
  })
})
