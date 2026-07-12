import type { Agent } from "@vibe/agent"
import type { Logger, ModelProvider } from "@vibe/model"
import { createAnthropicProvider } from "@vibe/model"
import type {
  AgentRunResult,
  RunAgentOptions,
  SessionStatus,
  SystemLike,
  ToolSession,
} from "./types"

export class Session implements ToolSession {
  readonly #repoRoot: string
  #provider: ModelProvider | null = null
  #agent: Agent | null = null

  constructor(repoRoot: string, logger: Logger) {
    this.#repoRoot = repoRoot
    this.#logger = logger
  }

  get repoRoot(): string {
    return this.#repoRoot
  }

  getProvider(): ModelProvider {
    if (!this.#provider) {
      this.#provider = createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" })
    }
    return this.#provider
  }

  async system(): Promise<SystemLike> {
    return {
      info: {
        name: "vibe-mcp",
        version: "0.0.0",
        state: "running",
        uptimeMs: 0,
        pluginCount: 0,
      },
      stop: async () => {},
    }
  }

  async status(): Promise<SessionStatus> {
    return {
      repoRoot: this.#repoRoot,
      providerId: this.#provider ? "anthropic" : null,
      toolCount: 0,
      system: {
        name: "vibe-mcp",
        version: "0.0.0",
        state: "running",
        uptimeMs: 0,
        pluginCount: 0,
      },
    }
  }

  registerBuiltinTools(): void {}

  listTools() {
    return []
  }

  getTool(_name: string) {
    return undefined
  }

  async runAgent(prompt: string, options?: RunAgentOptions): Promise<AgentRunResult> {
    const result = await this.#agent?.run(prompt, options)
    if (!result) throw new Error("Agent not initialized")
    return result
  }

  async stop(): Promise<void> {
    await this.#agent?.stop()
  }
}
