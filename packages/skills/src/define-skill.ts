import type { StandardSchemaV1 } from "@standard-schema/spec"
import { defineTool, type ToolDefinition } from "vibe/tools"

import type { Skill } from "./types"

export interface SkillDefinition<Name extends string, Schema extends StandardSchemaV1>
  extends ToolDefinition<Name, Schema> {
  /** Free-form tags for discovery/filtering. */
  tags?: readonly string[]
  /** Illustrative input/output pairs surfaced to the model. */
  examples?: ReadonlyArray<{ readonly input: string; readonly output: string }>
}

/**
 * Define an executable ("code") skill. Built on {@link defineTool}, so the schema
 * is the single source of truth — typing the handler input, validating at runtime,
 * and producing the model-facing JSON Schema — with skill discovery metadata added.
 */
export function defineSkill<const Name extends string, Schema extends StandardSchemaV1>(
  def: SkillDefinition<Name, Schema>,
): Skill<Name, Schema> {
  const tool = defineTool(def)
  return { ...tool, meta: { kind: "code", tags: def.tags, examples: def.examples } }
}
