import { type Agent, type AgentConfig, type AgentResult, createAgent } from "@@vibe/agent"
import { createContainer, createToken } from "@@vibe/di"
import { configError } from "@@vibe/errors"
import { createLifecycle } from "@@vibe/lifecycle"
import { createLogger, type Logger, LogLevel } from "@@vibe/logger"
import { createInMemoryMemory, type Memory } from "@@vibe/memory"
import { type ModelProvider, modelProviderToken } from "@@vibe/model"
import { createPluginHost, type PluginHost } from "@@vibe/plugin"
import { createRuntime, type Runtime } from "@@vibe/runtime"
import { VERSION } from "@@vibe/shared"
import { createToolRegistry, type ToolRegistry } from "@@vibe/tools"

import {
  createEnterpriseServices,
  type EnterpriseServices,
  type ObservabilityServices,
  type OntologyServices,
  type SecurityServices,
} from "./enterprise"
import type { AskOptions, SystemConfig, SystemInfo } from "./types"

export interface System {
  readonly name: string
  readonly info: SystemInfo
  readonly logger: Logger
  readonly plugins: PluginHost
  readonly runtime: Runtime
  /** Governance policy engine built from the app's `governance` config. */
  readonly governance: EnterpriseServices["governance"]
  /** Security services (PII redaction, guardrails, rate limits, secrets). */
  readonly security: SecurityServices
  /** Observability services (metrics, audit, tracing flag). */
  readonly observability: ObservabilityServices
  /** Ontology services (entity registry + semantic store). */
  readonly ontology: OntologyServices
  /** The skill registry (also merged into the tool registry). */
  readonly skills: EnterpriseServices["skills"]
  /** Named workflows from config. */
  readonly workflows: EnterpriseServices["workflows"]
  init(): Promise<void>
  start(): Promise<void>
  stop(timeoutMs?: number): Promise<void>
  /** One-shot: run the default agent to completion and return its text. */
  ask(prompt: string, options?: AskOptions): Promise<string>
  /** Build a custom agent bound to this system's provider (unless overridden). */
  agent(config?: Partial<AgentConfig>): Agent
}

export const containerToken = createToken("system.container")
export const loggerToken = createToken<Logger>("system.logger")
export const lifecycleToken = createToken("system.lifecycle")
export const pluginHostToken = createToken<PluginHost>("system.plugins")
export const toolRegistryToken = createToken<ToolRegistry>("system.tools")
export const memoryToken = createToken<Memory>("system.memory")
export const enterpriseToken = createToken<EnterpriseServices>("system.enterprise")

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
  const memory = config.memory ?? createInMemoryMemory()
  // Instantiate enterprise services and merge configured skills into the tool registry.
  const enterprise = createEnterpriseServices(config, toolRegistry, logger)

  container.registerInstance(containerToken, container)
  container.registerInstance(loggerToken, logger)
  container.registerInstance(lifecycleToken, lifecycle)
  container.registerInstance(pluginHostToken, plugins)
  container.registerInstance(toolRegistryToken, toolRegistry)
  container.registerInstance(memoryToken, memory)
  container.registerInstance(enterpriseToken, enterprise)
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
  const enforceGovernance = config.governance?.enforce !== false

  // Finished spans go to the structured logger, so they reach the same sinks as every other log
  // line, and to an OTLP collector when one is configured.
  const otlp = config.observability?.otlp
    ? createOTLPHttpExporter({
        endpoint: config.observability.otlp.endpoint,
        headers: config.observability.otlp.headers,
        serviceName: config.observability.otlp.serviceName ?? config.name,
        onError: (error) => logger.warn("trace.export_failed", { error: String(error) }),
      })
    : undefined
  const tracingEnabled = Boolean(config.observability?.tracing || otlp)
  const traceTracer = createTracer({
    exporter: {
      export(span) {
        logger.info("trace.span", {
          name: span.name,
          durationMs: span.durationMs,
          status: span.status,
          attributes: span.attributes,
        })
        otlp?.export(span)
      },
    },
  })

  lifecycle.onBefore("init", () => {
    logger.debug("System initializing", { system: config.name })
  })

  lifecycle.onAfter("init", () => {
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

  lifecycle.onAfter("start", () => {
    logger.info("System started", {
      system: config.name,
      uptimeMs: Date.now() - startTime,
    })
  })

  lifecycle.onBefore("stop", async () => {
    logger.info("System stopping", { system: config.name })
    await plugins.shutdown()
  })

  lifecycle.onAfter("stop", () => {
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

    get governance() {
      return enterprise.governance
    },

    get security() {
      return enterprise.security
    },

    get observability() {
      return enterprise.observability
    },

    get ontology() {
      return enterprise.ontology
    },

    get skills() {
      return enterprise.skills
    },

    get workflows() {
      return enterprise.workflows
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
      await otlp?.flush()
    },

    agent(overrides: Partial<AgentConfig> = {}): Agent {
      return createAgent({
        provider: overrides.provider ?? requireProvider(),
        model: overrides.model ?? config.model,
        system: overrides.system ?? config.system,
        effort: overrides.effort ?? config.effort,
        maxTokens: overrides.maxTokens,
        budget: overrides.budget,
        compaction: overrides.compaction,
        frameToolOutput: overrides.frameToolOutput,
        tools: overrides.tools ?? toolRegistry,
        // Governance is enforced by default: the system's policy engine checks every tool call.
        // With no policies configured the engine allows everything, so this costs nothing until
        // the app declares rules. `governance.enforce: false` opts system agents out.
        governance:
          overrides.governance ??
          (enforceGovernance ? { engine: enterprise.governance } : undefined),
        memory,
        // Agent hooks reach every plugin registered on this system's plugin host.
        hooks: overrides.hooks ?? ((name, payload) => plugins.emit(name, payload)),
      })
    },

    async ask(prompt: string, options: AskOptions = {}): Promise<string> {
      if (options.runId && !config.checkpointStore) {
        throw configError("ask({ runId }) needs a checkpointStore in the system config.")
      }
      const agent = system.agent()
      const runOptions = {
        conversationId: options.conversationId,
        checkpoint:
          options.runId && config.checkpointStore
            ? { runId: options.runId, store: config.checkpointStore }
            : undefined,
      }
      const result: AgentResult = tracingEnabled
        ? await traceAgentRun(agent, { text: prompt }, traceTracer, runOptions)
        : await agent.run({ text: prompt }, runOptions)
      return result.text
    },
  }

  return system
}
