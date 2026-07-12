import { z } from "zod"

import { createVibeEngineerAgent } from "../agent/vibe-engineer"
import type { McpTool } from "../types"

/** `vibe.dev.engineer.*` — the autonomous meta agent that designs and operates Vibe. */
export const engineerTools: McpTool[] = [
  {
    name: "vibe_dev_engineer_run",
    description:
      "Run the autonomous Vibe engineer meta-agent on an engineering task. It has the built-in operator tools plus every vibe.* capability, and works inside the monorepo. Returns the final text, iteration count, and token usage. Requires a model provider (ANTHROPIC_API_KEY).",
    schema: z.object({
      task: z.string().describe("A complete, self-contained engineering task for the agent."),
      maxIterations: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Hard ceiling on model round-trips (default 10)."),
    }),
    async execute(args, ctx) {
      const agent = createVibeEngineerAgent(
        ctx.session,
        ctx.repoRoot,
        ctx.session.getProvider(),
        ctx.logger,
      )
      const result = await agent.run({ text: args.task }, { maxIterations: args.maxIterations })
      return {
        text: result.text,
        iterations: result.iterations,
        stopReason: result.stopReason,
        usage: result.usage,
      }
    },
  },
]
