import type { StandardSchemaV1 } from "@standard-schema/spec"
import type { AnyTool, Tool } from "vibe/tools"

/**
 * How a skill is delivered to the model:
 * - `code` — an executable skill with a validated schema + handler (a typed tool).
 * - `procedure` — a markdown playbook injected on demand; its handler returns the
 *   procedure body so the model reads it only when it elects to use the skill.
 */
export type SkillKind = "code" | "procedure"

/** Metadata a skill carries beyond a plain tool. */
export interface SkillMeta {
  readonly kind: SkillKind
  readonly tags?: readonly string[]
  readonly examples?: ReadonlyArray<{ readonly input: string; readonly output: string }>
}

/**
 * A skill is a superset of a {@link Tool}: it registers and executes exactly like a
 * tool (validation/timeout/cancellation unchanged) but carries discovery metadata
 * and can be a markdown procedure as well as executable code.
 */
export interface Skill<
  Name extends string = string,
  Schema extends StandardSchemaV1 = StandardSchemaV1,
> extends Tool<Name, Schema> {
  readonly meta: SkillMeta
}

/** A skill with its schema erased — the element type of a heterogeneous skill list. */
export interface AnySkill extends AnyTool {
  readonly meta: SkillMeta
}
