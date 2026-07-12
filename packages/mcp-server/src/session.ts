import { createAgent } from "@vibe/agent"
import { createSystem, type System } from "@vibe/core"
import { configError } from "@vibe/errors"
import { createLogger, type Logger, LogLevel } from "@vibe/logger"
import { createAnthropicProvider, type ModelProvider } from "@vibe/model"
import { createToolRegistry, type Tool, type ToolRegistry } from "@vibe/tools"

import { createBuiltinTools } from "./tools/builtin"
import type {
  AgentRunResult,
  RunAgentOptions,
  SessionStatus,
  SystemLike,
  ToolInfo,
  ToolSession,
  ToolSummary,
} from "./types"

/**
 * One per server: owns the lazy `@vibe/core` System, the model provider (from
 * `ANTHROPIC_API_KEY` or an injected one), and a shared `ToolRegistry` seeded with
 * the built-in operator tools. Runtime and dev tools, and the meta agent, all talk
 * to Vibe through this one object. Backed by the fake provider in tests.
 */
export class Session implements ToolSession {
  readonly #repoRoot: string
  readonly #logger: Logger
  #provider?: ModelProvider
  #live?: System
  readonly #registry: ToolRegistry = createToolRegistry()
  #builtinSeeded = false

  constructor(repoRoot: string, logger?: Logger, provider?: ModelProvider) {
    this.#repoRoot = repoRoot
    this.#logger = logger ?? createLogger({ level: LogLevel.Error })
    if (provider) {
      this.#provider = provider
    } else if (process.env.ANTHROPIC_API_KEY) {
      this.#provider = createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
    }
  }

  get repoRoot(): string {
    return this.#repoRoot
  }

  getProvider(): ModelProvider {
    if (!this.#provider) {
      throw configError(
        "No model provider available. Set ANTHROPIC_API_KEY (or pass a provider) to run agents.",
      )
    }
    return this.#provider
  }

  async system(): Promise<SystemLike> {
    if (!this.#live) {
      this.#live = createSystem({
        name: "vibe-mcp",
        provider: this.#provider,
        logLevel: LogLevel.Error,
      })
      await this.#live.start()
    }
    return this.#live
  }

  async status(): Promise<SessionStatus> {
    this.registerBuiltinTools()
    const sys = await this.system()
    return {
      repoRoot: this.#repoRoot,
      providerId: this.#provider?.id ?? null,
      toolCount: this.#registry.list().length,
      system: {
        name: sys.info.name,
        version: sys.info.version,
        state: sys.info.state,
        uptimeMs: sys.info.uptimeMs,
        pluginCount: sys.info.pluginCount,
      },
    }
  }

  registerBuiltinTools(): void {
    if (this.#builtinSeeded) {
      return
    }
    for (const tool of createBuiltinTools(this.#repoRoot)) {
      if (!this.#registry.has(tool.name)) {
        this.#registry.register(tool)
      }
    }
    this.#builtinSeeded = true
    this.#logger.debug("seeded builtin tools", { count: this.#registry.list().length })
  }

  listTools(): ToolSummary[] {
    return this.#registry.list().map((tool) => ({ name: tool.name, description: tool.description }))
  }

  getTool(name: string): ToolInfo | undefined {
    const tool = this.#registry.get(name)
    if (!tool) {
      return undefined
    }
    return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema }
  }

  async runAgent(prompt: string, options: RunAgentOptions = {}): Promise<AgentRunResult> {
    this.registerBuiltinTools()
    let tools: Tool[] = this.#registry.list()
    if (options.toolNames) {
      const allowed = new Set(options.toolNames)
      tools = tools.filter((tool) => allowed.has(tool.name))
    }
    const agent = createAgent({
      provider: this.getProvider(),
      system: options.system,
      model: options.model,
      tools,
    })
    const result = await agent.run({ text: prompt }, { maxIterations: options.maxIterations })
    return {
      text: result.text,
      iterations: result.iterations,
      stopReason: result.stopReason,
      usage: result.usage,
    }
  }

  async stop(): Promise<void> {
    if (this.#live) {
      const live = this.#live
      this.#live = undefined
      await live.stop()
    }
  }
}
