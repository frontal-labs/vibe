import type { AnyTool, ToolSchema } from "@vibe/tools"

import type { AnySkill, SkillKind } from "./types"

/**
 * A name-indexed collection of skills (code + procedure), unified so agents can
 * consume both through one surface. Skills are tools, so {@link SkillRegistry.toTools}
 * yields exactly what `createAgent({ tools })` expects.
 */
export interface SkillRegistry {
  register(skill: AnySkill): void
  get(name: string): AnySkill | undefined
  has(name: string): boolean
  list(kind?: SkillKind): AnySkill[]
  /** The skills as plain tools, for agent/tool-registry consumption. */
  toTools(): AnyTool[]
  /** The model-facing schemas. */
  toSchemas(): ToolSchema[]
}

export function createSkillRegistry(initial: readonly AnySkill[] = []): SkillRegistry {
  const skills = new Map<string, AnySkill>()

  function register(skill: AnySkill): void {
    if (skills.has(skill.name)) {
      throw new Error(`Duplicate skill name: "${skill.name}"`)
    }
    skills.set(skill.name, skill)
  }

  for (const skill of initial) register(skill)

  return {
    register,
    get: (name) => skills.get(name),
    has: (name) => skills.has(name),
    list: (kind) => [...skills.values()].filter((s) => (kind ? s.meta.kind === kind : true)),
    toTools: () => [...skills.values()],
    toSchemas: () =>
      [...skills.values()].map((s) => ({
        name: s.name,
        description: s.description,
        inputSchema: s.inputSchema,
      })),
  }
}
