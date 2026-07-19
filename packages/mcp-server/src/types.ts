import type { Logger } from "vibe/logger"
import type { ModelProvider, StopReason, TokenUsage } from "vibe/model"
import type { z } from "zod"

/** A configured agent run's terminal result, normalized for MCP/agent output. */
export interface AgentRunResult {
  readonly text: string
  readonly iterations: number
  readonly stopReason: StopReason
  readonly usage: TokenUsage
}

/** Knobs for driving an agent run through the session. */
export interface RunAgentOptions {
  readonly system?: string
  readonly model?: string
  readonly toolNames?: string[]
  readonly maxIterations?: number
}

export interface ToolSummary {
  readonly name: string
  readonly description: string
}

export interface ToolInfo {
  readonly name: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
}

export interface SessionStatus {
  readonly repoRoot: string
  readonly providerId: string | null
  readonly toolCount: number
  readonly system: {
    readonly name: string
    readonly version: string
    readonly state: string
    readonly uptimeMs: number
    readonly pluginCount: number
  }
}

/**
 * The services every tool handler receives. A single `ToolSession` instance backs
 * the whole server (and the meta agent), so tools share one composition root.
 */
export interface ToolSession {
  readonly repoRoot: string
  getProvider(): ModelProvider
  system(): Promise<SystemLike>
  status(): Promise<SessionStatus>
  registerBuiltinTools(): void
  listTools(): ToolSummary[]
  getTool(name: string): ToolInfo | undefined
  runAgent(prompt: string, options?: RunAgentOptions): Promise<AgentRunResult>
  stop(): Promise<void>
}

/** Minimal shape of `vibe/core`'s `System` we depend on. */
export interface SystemLike {
  readonly info: {
    readonly name: string
    readonly version: string
    readonly state: string
    readonly uptimeMs: number
    readonly pluginCount: number
  }
  stop(timeoutMs?: number): Promise<void>
}

export interface ToolContext {
  readonly session: ToolSession
  readonly repoRoot: string
  readonly logger: Logger
}

/**
 * One capability, defined once. Exposed to MCP by the server and to the meta agent
 * by wrapping it as a `vibe/tools` `Tool` — one schema, two consumers.
 */
export interface McpTool<Schema extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly name: string
  readonly description: string
  readonly schema: Schema
  // biome-ignore lint/suspicious/noExplicitAny: tools stored as McpTool[] erase Schema (z.infer<ZodTypeAny> is unknown in Zod 4); the server validates via schema.parse before execute.
  readonly execute: (args: any, ctx: ToolContext) => Promise<unknown>
}
