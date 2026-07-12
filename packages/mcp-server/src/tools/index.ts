import type { McpTool } from "../types"
import { devTools } from "./dev"
import { engineerTools } from "./engineer"
import { runtimeTools } from "./runtime"

/** Every capability, in one place — the single source of truth for both surfaces. */
export const allTools: McpTool[] = [...runtimeTools, ...devTools, ...engineerTools]
