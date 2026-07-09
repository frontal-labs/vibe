import { describe, expect, it } from "vitest"

import type { Plugin, PluginHooks } from "@vibe/plugin"
import { createSystem } from "../src/system"
import { vibe } from "../src/vibe"

function createTestPlugin(name: string, setupFn?: (hooks: PluginHooks) => void): Plugin {
  return {
    name,
    version: "1.0.0",
    manifest: {
      name,
      version: "1.0.0",
      description: `Test plugin ${name}`,
    },
    setup(hooks: PluginHooks) {
      setupFn?.(hooks)
    },
  }
}

describe("System", () => {
  it("should create a system with a name", () => {
    const system = vibe.system({ name: "test-system" })
    expect(system.name).toBe("test-system")
  })

  it("should start in created lifecycle state", () => {
    const system = vibe.system({ name: "test" })
    expect(system.info.state).toBe("created")
  })

  it("should initialize and start", async () => {
    const system = vibe.system({ name: "test" })
    await system.start()
    expect(system.info.state).toBe("ready")
  })

  it("should stop gracefully", async () => {
    const system = vibe.system({ name: "test" })
    await system.start()
    await system.stop()
    expect(system.info.state).toBe("stopped")
  })

  it("should have uptime tracking", async () => {
    const system = vibe.system({ name: "test" })
    await system.start()
    expect(system.info.uptimeMs).toBeGreaterThanOrEqual(0)
  })

  it("should load plugins on start", async () => {
    const plugin = createTestPlugin("test-plugin")
    const system = vibe.system({ name: "test", plugins: [plugin] })

    await system.start()
    expect(system.info.pluginCount).toBe(1)
    expect(system.plugins.getPlugin("test-plugin")).toBeDefined()
  })

  it("should throw NotImplementedError on ask", async () => {
    const system = vibe.system({ name: "test" })
    await system.start()

    await expect(system.ask("Hello")).rejects.toThrow()
  })

  it("should support stop with timeout", async () => {
    const system = vibe.system({ name: "test" })
    await system.start()
    await system.stop(100)
    expect(system.info.state).toBe("stopped")
  })

  it("should create system via createSystem function", () => {
    const system = createSystem({ name: "create-test" })
    expect(system.name).toBe("create-test")
  })
})
