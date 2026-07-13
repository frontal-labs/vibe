import type { StandardSchemaV1 } from "@standard-schema/spec"

import type { Skill, SkillMeta } from "./types"

/** The parsed pieces of a markdown skill file. */
export interface MarkdownSkill {
  readonly name: string
  readonly description: string
  readonly tools: readonly string[]
  readonly tags: readonly string[]
  /** The procedure body (everything after the frontmatter). */
  readonly body: string
}

/**
 * A permissive Standard Schema accepting any (or no) input — procedure skills take
 * no structured arguments; the model invokes them to read the playbook body.
 */
const PROCEDURE_SCHEMA: StandardSchemaV1<Record<string, never>, Record<string, never>> = {
  "~standard": {
    version: 1,
    vendor: "vibe",
    validate: (value) => ({ value: (value ?? {}) as Record<string, never> }),
  },
}

/** Parse a scalar frontmatter value, unwrapping quotes and `[a, b]` inline lists. */
function parseValue(raw: string): string | string[] {
  const value = raw.trim()
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter((s) => s.length > 0)
  }
  return value.replace(/^["']|["']$/g, "")
}

/**
 * Split a markdown skill file into YAML-ish frontmatter and body. Supports simple
 * `key: value` pairs and inline `[a, b]` lists (the subset skill frontmatter uses).
 */
export function parseMarkdownSkill(source: string): MarkdownSkill {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(source)
  const frontmatter = match?.[1] ?? ""
  const body = (match?.[2] ?? source).trim()

  const fields: Record<string, string | string[]> = {}
  for (const line of frontmatter.split("\n")) {
    const colon = line.indexOf(":")
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    if (key) fields[key] = parseValue(line.slice(colon + 1))
  }

  const asString = (v: string | string[] | undefined): string =>
    typeof v === "string" ? v : (v?.[0] ?? "")
  const asList = (v: string | string[] | undefined): string[] =>
    Array.isArray(v) ? v : v ? [v] : []

  return {
    name: asString(fields.name),
    description: asString(fields.description),
    tools: asList(fields.tools),
    tags: asList(fields.tags),
    body,
  }
}

/**
 * Turn a parsed markdown skill into a {@link Skill}. It registers like any tool,
 * but its handler returns the procedure body — progressive disclosure: the full
 * playbook enters context only when the model chooses to invoke the skill.
 */
export function markdownSkill(parsed: MarkdownSkill): Skill {
  const meta: SkillMeta = { kind: "procedure", tags: parsed.tags }
  return {
    name: parsed.name,
    description: parsed.description,
    schema: PROCEDURE_SCHEMA,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    execute: () => parsed.body,
    meta,
  }
}

/** Parse and load a markdown skill from raw file contents in one step. */
export function loadMarkdownSkill(source: string): Skill {
  return markdownSkill(parseMarkdownSkill(source))
}
