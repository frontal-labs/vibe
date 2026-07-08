import { describe, it, expect, vi } from "vitest"

import { createPluginHost } from "../src/host"
import type { Plugin, PluginHooks } from "../src/types"

function createTestPlugin(
  name: string,
  setupFn?: (hooks: PluginHooks) => void,
  dependencies?: string[],
): Plugin {
  return {
    name,
    version: "1.0.0",
    manifest: {
      name,
      version: "1.0.0",
      description: `Test plugin ${name}`,
      dependencies,
    },
    setup(hooks: PluginHooks) {
      setupFn?.(hooks)
    },
  }
}

describe("PluginHost", () => {
  it("should register a plugin", async () => {
    const host = createPluginHost()
    const plugin = createTestPlugin("test-plugin")

    await host.register(plugin)
    expect(host.getPlugin("test-plugin")).toBe(plugin)
  })

  it("should throw on duplicate registration", async () => {
    const host = createPluginHost()
    const plugin = createTestPlugin("dup")

    await host.register(plugin)
    await expect(host.register(plugin)).rejects.toThrow()
  })

  it("should unregister a plugin", async () => {
    const host = createPluginHost()
    const plugin = createTestPlugin("temp")

    await host.register(plugin)
    await host.unregister("temp")
    expect(host.getPlugin("temp")).toBeUndefined()
  })

  it("should throw on unregister unknown plugin", async () => {
    const host = createPluginHost()
    await expect(host.unregister("unknown")).rejects.toThrow()
  })

  it("should return all registered plugins", async () => {
    const host = createPluginHost()
    const p1 = createTestPlugin("plugin-a")
    const p2 = createTestPlugin("plugin-b")

    await host.register(p1)
    await host.register(p2)

    const plugins = host.getPlugins()
    expect(plugins).toHaveLength(2)
    expect(plugins.map((p) => p.name).sort()).toEqual(["plugin-a", "plugin-b"])
  })

  it("should validate plugin dependencies", async () => {
    const host = createPluginHost()
    const plugin = createTestPlugin("dependent", undefined, ["missing-dep")

    await expect(host.register(plugin)).rejects.toThrow()
  })

  it("should resolve plugin dependencies", async () => {
    const host = createPluginHost()
    const base = createTestPlugin("base")
    const dependent = createTestPlugin("dependent", undefined, ["base"])

    await host.register(base)
    await expect(host.register(dependent)).resolves.not.toThrow()
  })

  it("should call plugin setup on registration", async () => {
    const host = createPluginHost()
    const setupFn = vi.fn()

    const plugin = createTestPlugin("with-setup", setupFn)
    await host.register(plugin)

    expect(setupFn).toHaveBeenCalledOnce()
  })

  it("should fire startup and shutdown hooks", async () => {
    const host = createPluginHost()
    const startupFn = vi.fn()
    const shutdownFn = vi.fn()

    const plugin = createTestPlugin("hookable", (hooks) => {
      hooks.on("startup", startupFn)
      hooks.on("shutdown", shutdownFn)
    })

    await host.register(plugin)
    await host.startup()
    await host.shutdown()

    expect(startupFn).toHaveBeenCalledOnce()
    expect(shutdownFn).toHaveBeenCalledOnce()
  })

  it("should provide hook access via getHooks", async () => {
    const host = createPluginHost()
    const hooks = host.getHooks()

    expect(hooks.on).toBeDefined()
    expect(hooks.onBefore).toBeDefined()
    expect(hooks.onAfter).toBeDefined()
  })
})
