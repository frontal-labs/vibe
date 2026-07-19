import { existsSync, readdirSync, statSync } from "node:fs"
import { basename, join } from "node:path"

import { findConfig, loadConfig } from "vibe/config"

import type { AppEntry, AppGraph } from "./types"

const SOURCE_EXTS = [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"] as const

function isSource(file: string): boolean {
  return SOURCE_EXTS.some((ext) => file.endsWith(ext) && !file.endsWith(`.d${ext}`))
}

/** Turn `agents/get-order.ts` into the entry name `get-order`. */
function entryName(file: string): string {
  return basename(file)
    .replace(/\.(m|c)?(t|j)s$/, "")
    .replace(/\.md$/, "")
}

function scanDir(dir: string, accept: (file: string) => boolean = isSource): AppEntry[] {
  if (!(existsSync(dir) && statSync(dir).isDirectory())) {
    return []
  }
  return readdirSync(dir)
    .filter((f) => accept(f))
    .map((f) => ({ name: entryName(f), file: join(dir, f) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Skills accept source modules (code skills) and `.md` files (procedure skills). */
function isSkillFile(file: string): boolean {
  return isSource(file) || file.endsWith(".md")
}

/**
 * Resolve an app directory into its build graph via conventions + config:
 * `agents/*`, `tools/*`, `skills/*` (code + `.md` procedures), and `workflows/*`
 * are auto-discovered (each default-exports one), and `vibe.config.*` is loaded
 * when present. This is the Next.js-style convention layer the bundler consumes.
 */
export async function discoverApp(root: string): Promise<AppGraph> {
  const config = findConfig(root) ? await loadConfig(root) : undefined
  return {
    root,
    config,
    agents: scanDir(join(root, "agents")),
    tools: scanDir(join(root, "tools")),
    skills: scanDir(join(root, "skills"), isSkillFile),
    workflows: scanDir(join(root, "workflows")),
  }
}
