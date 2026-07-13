import type { CompactionStrategy } from "@vibe/memory"
import { createConversation } from "@vibe/memory"
import type { Effort, ModelProvider } from "@vibe/model"
import { DEFAULT_MODEL } from "@vibe/model"
import type { AnyTool, ToolRegistry } from "@vibe/tools"
import { createToolRegistry } from "@vibe/tools"

import { drain } from "./events"
import { runLoop } from "./loop"
import type { Agent, AgentEvent, AgentInput, RunOptions } from "./types"

export interface AgentConfig<Tools extends readonly AnyTool[] = readonly AnyTool[]> {
  provider: ModelProvider
  model?: string
  system?: string
  effort?: Effort
  maxTokens?: number
  /** Max input tokens per request. Defaults to the model's context window minus an output reserve. */
  budget?: number
  /** How to compact the transcript when it exceeds the budget. Defaults to `drop-oldest`. */
  compaction?: CompactionStrategy
  /** Tools available to the agent — a list (its literal set is captured) or a prebuilt registry. */
  tools?: Tools | ToolRegistry
}

/**
 * Create an agent bound to a provider, system prompt, and tool set. When `tools` is
 * a list, its exact set is captured in the type, so `agent.stream()` yields
 * `toolCall` events narrowed to those tools' names and input types. Each `run`/
 * `stream` gets a fresh conversation, so an agent instance is reusable and stateless.
 */
export function createAgent<const Tools extends readonly AnyTool[] = readonly AnyTool[]>(
  config: AgentConfig<Tools>,
): Agent<Tools> {
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
        budget: config.budget,
        compaction: config.compaction,
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
    // The loop yields the wide event union at runtime; the tool names it produces
    // are exactly this agent's tools, so narrowing to `AgentEvent<Tools>` is sound.
    stream: (input, options) =>
      loop(input, options) as AsyncGenerator<AgentEvent<Tools>, import("./types").AgentResult>,
  }
}

function toRegistry(tools: readonly AnyTool[] | ToolRegistry | undefined): ToolRegistry {
  if (!tools) {
    return createToolRegistry()
  }
  if (Array.isArray(tools)) {
    return createToolRegistry(tools)
  }
  // Not an array → a prebuilt registry. (Readonly arrays are real arrays at runtime,
  // so `Array.isArray` handles them above; the cast just satisfies the narrowing.)
  return tools as ToolRegistry
}
