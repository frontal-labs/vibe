import { z } from "zod"

import type { Tool, ToolHandler } from "./types"

export interface ToolDefinition<Schema extends z.ZodType> {
  name: string
  description: string
  /** A Zod schema; `z.infer` types the handler's `input`. */
  schema: Schema
  execute: ToolHandler<Schema>
}

/**
 * Define a tool from a single Zod schema. The schema types the handler's input
 * (`z.infer`) and, via `z.toJSONSchema`, produces the model-facing JSON Schema —
 * one definition, two consumers.
 */
export function defineTool<Schema extends z.ZodType>(def: ToolDefinition<Schema>): Tool<Schema> {
  return {
    name: def.name,
    description: def.description,
    schema: def.schema,
    inputSchema: z.toJSONSchema(def.schema, { target: "draft-2020-12" }) as Record<string, unknown>,
    execute: def.execute,
  }
}
