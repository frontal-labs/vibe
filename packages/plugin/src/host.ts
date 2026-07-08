import { pluginConflictError, pluginNotFoundError } from "@vibe/errors"

import { createPluginHooks } from "./hooks"
import type { Plugin, PluginHooks } from "./types"

export interface PluginHost {
  register(plugin: Plugin): Promise<void>
  unregister(name: string): Promise<void>
  getPlugin(name: string): Plugin | undefined
  getPlugins(): Plugin[]
  getHooks(): PluginHooks
  startup(): Promise<void>
  shutdown(): Promise<void>
}

export function createPluginHost(): PluginHost {
  const plugins = new Map<string, Plugin>()
  const hooks = createPluginHooks()

  function validateDependencies(plugin: Plugin): void {
    const deps = plugin.manifest.dependencies
    if (!deps) return
    for (const dep of deps) {
      if (!plugins.has(dep)) {
        throw pluginNotFoundError(
          `Plugin "${plugin.name}" requires dependency "${dep}" which is not registered`,
        )
      }
    }
  }

  async function register(plugin: Plugin): Promise<void> {
    if (plugins.has(plugin.name)) {
      throw pluginConflictError(`Plugin "${plugin.name}" is already registered`)
    }

    validateDependencies(plugin)
    plugins.set(plugin.name, plugin)
    await plugin.setup(hooks)
  }

  async function unregister(name: string): Promise<void> {
    if (!plugins.has(name)) {
      throw pluginNotFoundError(`Plugin "${name}" is not registered`)
    }
    plugins.delete(name)
  }

  function getPlugin(name: string): Plugin | undefined {
    return plugins.get(name)
  }

  function getPlugins(): Plugin[] {
    return Array.from(plugins.values())
  }

  function getHooks(): PluginHooks {
    return {
      on: hooks.on.bind(hooks),
      onBefore: hooks.onBefore.bind(hooks),
      onAfter: hooks.onAfter.bind(hooks),
    }
  }

  async function startup(): Promise<void> {
    await hooks.execute("startup")
  }

  async function shutdown(): Promise<void> {
    await hooks.execute("shutdown")
  }

  return {
    register,
    unregister,
    getPlugin,
    getPlugins,
    getHooks,
    startup,
    shutdown,
  }
}
