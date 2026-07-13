import type { Agent } from "@vibe/agent"
import { createAgent } from "@vibe/agent"
import type { Logger } from "@vibe/logger"
import { DEFAULT_MODEL, type ModelProvider } from "@vibe/model"
import type { AnyTool } from "@vibe/tools"
import { defineTool } from "@vibe/tools"

import { createBuiltinTools } from "../tools/builtin"
import { devTools } from "../tools/dev"
import { runtimeTools } from "../tools/runtime"
import type { McpTool, ToolContext, ToolSession } from "../types"

const ENGINEER_SYSTEM = `You are the Vibe engineer: an autonomous agent that designs, generates, and
operates the Vibe framework (a layered @vibe/* TypeScript runtime, with a Rust bundler
addon that accelerates @vibe/build). You work inside the monorepo at the workspace root.

Your tools are the same ones any MCP client uses:
- vibe_runtime_* to run agents and inspect tools,
- vibe_dev_* to build, test, lint, scaffold packages/agents, and read repo info,
- read_file / list_dir / run_command to read and change the codebase.

Operating loop for an engineering task:
1. Use vibe_dev_info to understand the package graph and conventions.
2. Read relevant source with read_file / list_dir before changing it.
3. Make the change (edit files, or vibe_dev_scaffold_package / vibe_dev_scaffold_agent to add).
4. Run vibe_dev_check (or vibe_dev_run with a specific script) and read the result.
5. If it failed, read the error, fix, and re-run. Do not claim success until ci:check is green.
6. Report what you changed and the final ci:check outcome.`

/** Convert one `McpTool` into a `@vibe/tools` `Tool`, sharing the same schema. */
function mcpToVibeTool(tool: McpTool, ctx: ToolContext): AnyTool {
  return defineTool({
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
    execute: (args) => tool.execute(args, ctx).then((result) => JSON.stringify(result, null, 2)),
  })
}

/**
 * Build the meta agent. Its tool set is the built-in operator tools plus every
 * `vibe.*` McpTool wrapped as a Vibe `Tool` — so the agent that designs and
 * generates Vibe consumes the exact same capabilities an external MCP client does.
 */
export function createVibeEngineerAgent(
  session: ToolSession,
  repoRoot: string,
  provider: ModelProvider,
  logger: Logger,
): Agent {
  const ctx: ToolContext = { session, repoRoot, logger }
  const builtins = createBuiltinTools(repoRoot)
  const mcpTools = [...runtimeTools, ...devTools].map((tool) => mcpToVibeTool(tool, ctx))
  return createAgent({
    provider,
    system: ENGINEER_SYSTEM,
    model: DEFAULT_MODEL,
    tools: [...builtins, ...mcpTools],
  })
}
