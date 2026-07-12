import { createConversation } from "@vibe/memory"
import type { Effort, ModelProvider } from "@vibe/model"
import { DEFAULT_MODEL } from "@vibe/model"
import type { Tool, ToolRegistry } from "@vibe/tools"
import { createToolRegistry } from "@vibe/tools"

import { drain } from "./events"
import { runLoop } from "./loop"
import type { Agent, AgentInput, RunOptions } from "./types"

export interface AgentConfig {
  provider: ModelProvider
  model?: string
  system?: string
  effort?: Effort
  maxTokens?: number
  /** Tools available to the agent — a list or a prebuilt registry. */
  tools?: Tool[] | ToolRegistry
}

/**
 * Create an agent bound to a provider, system prompt, and tool set. Each `run`/
 * `stream` gets a fresh conversation, so an agent instance is reusable and
 * stateless between calls.
 */
export function createAgent(config: AgentConfig): Agent {
  const model = config.model ?? DEFAULT_MODEL
  const registry = toRegistry(config.tools)

  function loop(input: AgentInput, options?: RunOptions) {
    return runLoop(
      {
        provider: config.provider,
        model,
        system: config.system,
        effort: config.effort,
        maxTokens: config.maxTokens,
        registry,
        conversation: createConversation({ system: config.system }),
      },
      input,
      options,
    )
  }

  return {
    model,
    run: (input, options) => drain(loop(input, options), options?.onEvent),
    stream: (input, options) => loop(input, options),
  }
}

function toRegistry(tools: AgentConfig["tools"]): ToolRegistry {
  if (!tools) return createToolRegistry()
  return Array.isArray(tools) ? createToolRegistry(tools) : tools
}
