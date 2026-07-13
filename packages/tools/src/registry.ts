import { validationError } from "@vibe/errors"
import type { ToolSchema } from "@vibe/model"

import type { AnyTool } from "./types"

/** A name-indexed collection of tools; rejects duplicate names. */
export interface ToolRegistry {
  register(tool: AnyTool): void
  get(name: string): AnyTool | undefined
  has(name: string): boolean
  list(): AnyTool[]
  /** The model-facing schemas, for the request builder. */
  toSchemas(): ToolSchema[]
}

export function createToolRegistry(initial: readonly AnyTool[] = []): ToolRegistry {
  const tools = new Map<string, AnyTool>()

  function register(tool: AnyTool): void {
    if (tools.has(tool.name)) {
      throw validationError(`Duplicate tool name: "${tool.name}"`)
    }
    tools.set(tool.name, tool)
  }

  for (const tool of initial) register(tool)

  return {
    register,
    get: (name) => tools.get(name),
    has: (name) => tools.has(name),
    list: () => [...tools.values()],
    toSchemas: () =>
      [...tools.values()].map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
  }
}
