import { createContainer, createToken } from "@vibe/di"
import { notImplementedError } from "@vibe/errors"
import { createLifecycle } from "@vibe/lifecycle"
import { LogLevel, type Logger, createLogger } from "@vibe/logger"
import { type PluginHost, createPluginHost } from "@vibe/plugin"
import { type Runtime, createRuntime } from "@vibe/runtime"
import { VERSION } from "@vibe/shared"

import type { SystemConfig, SystemInfo } from "./types"

export interface System {
  readonly name: string
  readonly info: SystemInfo
  readonly logger: Logger
  readonly plugins: PluginHost
  readonly runtime: Runtime
  init(): Promise<void>
  start(): Promise<void>
  stop(timeoutMs?: number): Promise<void>
  ask(prompt: string): Promise<string>
}

export const containerToken = createToken("system.container")
export const loggerToken = createToken<Logger>("system.logger")
export const lifecycleToken = createToken("system.lifecycle")
export const pluginHostToken = createToken<PluginHost>("system.plugins")

export function createSystem(config: SystemConfig): System {
  const container = createContainer()
  const lifecycle = createLifecycle()
  const logger = createLogger({
    level: config.logLevel ?? LogLevel.Info,
    defaultMeta: { system: config.name },
  })
  const plugins = createPluginHost()
  const runtime = createRuntime()

  container.registerInstance(containerToken, container)
  container.registerInstance(loggerToken, logger)
  container.registerInstance(lifecycleToken, lifecycle)
  container.registerInstance(pluginHostToken, plugins)

  const startTime = Date.now()

  lifecycle.onBefore("init", async () => {
    logger.debug("System initializing", { system: config.name })
  })

  lifecycle.onAfter("init", async () => {
    logger.info("System initialized", { system: config.name })
  })

  lifecycle.onBefore("start", async () => {
    logger.info("System starting", { system: config.name })
    const registeredPlugins = config.plugins ?? []
    for (const plugin of registeredPlugins) {
      await plugins.register(plugin)
    }
    if (registeredPlugins.length > 0) {
      await plugins.startup()
    }
  })

  lifecycle.onAfter("start", async () => {
    logger.info("System started", {
      system: config.name,
      uptimeMs: Date.now() - startTime,
    })
  })

  lifecycle.onBefore("stop", async () => {
    logger.info("System stopping", { system: config.name })
    await plugins.shutdown()
  })

  lifecycle.onAfter("stop", async () => {
    logger.info("System stopped", {
      system: config.name,
      uptimeMs: Date.now() - startTime,
    })
  })

  const system: System = {
    get name() {
      return config.name
    },

    get info(): SystemInfo {
      return {
        name: config.name,
        version: VERSION,
        state: lifecycle.state,
        uptimeMs: Date.now() - startTime,
        pluginCount: plugins.getPlugins().length,
      }
    },

    get logger() {
      return logger
    },

    get plugins() {
      return plugins
    },

    get runtime() {
      return runtime
    },

    async init() {
      await lifecycle.init()
    },

    async start() {
      await lifecycle.init()
      await lifecycle.start()
    },

    async stop(timeoutMs?: number) {
      await lifecycle.stop(timeoutMs)
    },

    async ask(_prompt: string): Promise<string> {
      throw notImplementedError(
        "ask() is not yet implemented. Use system.ask() after Phase 4 (Models) is complete.",
      )
    },
  }

  return system
}
