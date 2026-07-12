import { type Agent, type AgentConfig, type AgentResult, createAgent } from "@vibe/agent"
import { createContainer, createToken } from "@vibe/di"
import { configError } from "@vibe/errors"
import { createLifecycle } from "@vibe/lifecycle"
import { createLogger, type Logger, LogLevel } from "@vibe/logger"
import { createInMemoryMemory, type Memory } from "@vibe/memory"
import { type ModelProvider, modelProviderToken } from "@vibe/model"
import { createPluginHost, type PluginHost } from "@vibe/plugin"
import { createRuntime, type Runtime } from "@vibe/runtime"
import { VERSION } from "@vibe/shared"
import { createToolRegistry, type ToolRegistry } from "@vibe/tools"

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
  /** One-shot: run the default agent to completion and return its text. */
  ask(prompt: string): Promise<string>
  /** Build a custom agent bound to this system's provider (unless overridden). */
  agent(config?: Partial<AgentConfig>): Agent
}

export const containerToken = createToken("system.container")
export const loggerToken = createToken<Logger>("system.logger")
export const lifecycleToken = createToken("system.lifecycle")
export const pluginHostToken = createToken<PluginHost>("system.plugins")
export const toolRegistryToken = createToken<ToolRegistry>("system.tools")
export const memoryToken = createToken<Memory>("system.memory")

export function createSystem(config: SystemConfig): System {
  const container = createContainer()
  const lifecycle = createLifecycle()
  const logger = createLogger({
    level: config.logLevel ?? LogLevel.Info,
    defaultMeta: { system: config.name },
  })
  const plugins = createPluginHost()
  const runtime = createRuntime()
  const toolRegistry = createToolRegistry(config.tools ?? [])
  const memory = createInMemoryMemory()

  container.registerInstance(containerToken, container)
  container.registerInstance(loggerToken, logger)
  container.registerInstance(lifecycleToken, lifecycle)
  container.registerInstance(pluginHostToken, plugins)
  container.registerInstance(toolRegistryToken, toolRegistry)
  container.registerInstance(memoryToken, memory)
  if (config.provider) {
    container.registerInstance(modelProviderToken, config.provider)
  }

  function requireProvider(): ModelProvider {
    if (!config.provider) {
      throw configError(
        "No model provider configured. Pass `provider` to vibe.system({ ... }) to use ask()/agent().",
      )
    }
    return config.provider
  }

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

    agent(overrides: Partial<AgentConfig> = {}): Agent {
      return createAgent({
        provider: overrides.provider ?? requireProvider(),
        model: overrides.model ?? config.model,
        system: overrides.system ?? config.system,
        effort: overrides.effort ?? config.effort,
        maxTokens: overrides.maxTokens,
        tools: overrides.tools ?? toolRegistry,
      })
    },

    async ask(prompt: string): Promise<string> {
      const result: AgentResult = await system.agent().run({ text: prompt })
      return result.text
    },
  }

  return system
}
