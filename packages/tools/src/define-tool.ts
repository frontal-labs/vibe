import type { StandardSchemaV1 } from "@standard-schema/spec"

import { toJsonSchema } from "./to-json-schema"
import type { Tool, ToolHandler } from "./types"

export interface ToolDefinition<Name extends string, Schema extends StandardSchemaV1> {
  name: Name
  description: string
  /** Any Standard Schema (Zod by default; also Valibot, ArkType, …). */
  schema: Schema
  execute: ToolHandler<Schema>
}

/**
 * Define a tool from a single Standard Schema. The schema is the one source of
 * truth: it types the handler's input (inferred, typesafe by default), validates
 * at runtime, and — via `toJsonSchema` — produces the model-facing JSON Schema.
 * The literal tool `name` is captured in the type so tool sets narrow statically.
 */
export function defineTool<const Name extends string, Schema extends StandardSchemaV1>(
  def: ToolDefinition<Name, Schema>,
): Tool<Name, Schema> {
  return {
    name: def.name,
    description: def.description,
    schema: def.schema,
    inputSchema: toJsonSchema(def.schema),
    execute: def.execute,
  }
}
