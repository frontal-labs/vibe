import { existsSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"

import { configError } from "@vibe/errors"

/**
 * Resolve `target` against `root`, refusing anything that escapes the workspace.
 * Used by every tool that touches the filesystem so an agent can't read or write
 * outside the repo it is operating on.
 */
export function resolveWithin(root: string, target: string): string {
  const full = resolve(root, target)
  const rel = relative(root, full)
  if (rel === "" || !rel.startsWith("..")) return full
  throw configError(`Path "${target}" escapes the workspace root "${root}".`)
}

/**
 * Walk up from `start` until a marker file (`turbo.json`) is found,
 * so the server always knows the real repo root regardless of the cwd it was
 * launched from. Falls back to `start` if none is found.
 */
export function resolveRepoRoot(start: string, marker = "turbo.json"): string {
  let dir = resolve(start)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (existsSync(resolve(dir, marker))) return dir
    const parent = resolve(dir, "..")
    if (parent === dir) return resolve(start)
    dir = parent
  }
}

export { isAbsolute }
