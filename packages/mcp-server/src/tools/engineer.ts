import { z } from "zod"
import type { McpTool } from "../types"

const runAgentTool: McpTool = {
  name: "run_agent",
  description: "Run an agent with the given prompt and options.",
  schema: z.object({
    prompt: z.string().describe("The prompt to run the agent with."),
    system: z.string().optional().describe("Custom system prompt."),
    model: z.string().optional().describe("Model to use."),
    toolNames: z.array(z.string()).optional().describe("Tools to use."),
    maxIterations: z.number().optional().describe("Maximum iterations."),
  }),
  execute: async (args, ctx) => {
    return await ctx.session.runAgent(args.prompt, {
      system: args.system,
      model: args.model,
      toolNames: args.toolNames,
      maxIterations: args.maxIterations,
    })
  },
}

export const engineerTools: McpTool[] = [runAgentTool]
