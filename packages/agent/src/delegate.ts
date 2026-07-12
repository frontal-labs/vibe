import type { Tool } from "@vibe/tools"
import { defineTool } from "@vibe/tools"
import { z } from "zod"
import type { AgentConfig } from "./agent"
import { createAgent } from "./agent"

export interface DelegateToolConfig extends AgentConfig {
  /** Tool name the coordinator sees. Default `"delegate"`. */
  name?: string
  /** Tool description shown to the model. */
  description?: string
}

/**
 * Build a tool that hands a self-contained subtask to a sub-agent and returns its
 * answer. Drop it into a coordinator's tool set to get one-level delegation — the
 * common coordinator/worker pattern. Pair with a cheap model (e.g.
 * `claude-haiku-4-5`) for fan-out. The caller's cancellation token and logger flow
 * into the sub-agent's run, so cancelling the coordinator cancels its workers.
 * Deeper nesting is intentionally not wired yet.
 */
export function createDelegateTool(config: DelegateToolConfig): Tool {
  const { name, description, ...agentConfig } = config
  const agent = createAgent(agentConfig)

  return defineTool({
    name: name ?? "delegate",
    description:
      description ??
      "Delegate a complete, self-contained subtask to a specialized sub-agent and return its answer.",
    schema: z.object({
      task: z.string().describe("A complete, self-contained description of the subtask to perform"),
    }),
    execute: async (input, ctx) => {
      const result = await agent.run(
        { text: input.task },
        { cancellationToken: ctx.cancellationToken, logger: ctx.logger },
      )
      return result.text
    },
  })
}
