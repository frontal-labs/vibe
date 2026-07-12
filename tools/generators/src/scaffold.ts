import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"

import { renderTree } from "./render"

/** Read a template directory into a `{ relativePath: content }` tree. */
export function readTemplateTree(dir: string): Record<string, string> {
  const tree: Record<string, string> = {}
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
      } else {
        tree[relative(dir, full)] = readFileSync(full, "utf8")
      }
    }
  }
  walk(dir)
  return tree
}

/** Write a rendered `{ path: content }` tree under `targetDir`. Returns written paths. */
export function writeTree(targetDir: string, tree: Record<string, string>): string[] {
  const written: string[] = []
  for (const [rel, content] of Object.entries(tree)) {
    const full = join(targetDir, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
    written.push(full)
  }
  return written
}

export interface ScaffoldOptions {
  /** Refuse to write if the target directory already has files. */
  readonly force?: boolean
}

/**
 * Render a Handlebars template directory to `targetDir` with `data`. Returns the
 * created file paths. This is the engine behind `vibe new`.
 */
export function scaffold(
  templateDir: string,
  targetDir: string,
  data: Record<string, unknown>,
  options: ScaffoldOptions = {},
): string[] {
  if (!options.force && existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    throw new Error(`Target directory is not empty: ${targetDir} (pass force to override)`)
  }
  const rendered = renderTree(readTemplateTree(templateDir), data)
  return writeTree(targetDir, rendered)
}
