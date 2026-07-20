import { existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { build as esbuild } from "esbuild"
import { configError, withHint } from "vibe/errors"

import type { VibeConfig } from "./types"

const CONFIG_NAMES = [
  "vibe.config.ts",
  "vibe.config.mts",
  "vibe.config.cts",
  "vibe.config.js",
  "vibe.config.mjs",
  "vibe.config.cjs",
]

/** Find the `vibe.config.*` file in `cwd`, or `undefined` if none exists. */
export function findConfig(cwd: string = process.cwd()): string | undefined {
  for (const name of CONFIG_NAMES) {
    const full = resolve(cwd, name)
    if (existsSync(full)) {
      return full
    }
  }
  return undefined
}

const TS_CONFIG = /\.[mc]?ts$/

/**
 * Load and return the `VibeConfig` from a `vibe.config.*` file (its default export). Tries a direct
 * dynamic `import` first (fast path for TS-aware runtimes like Bun); if that fails on a TypeScript
 * config — e.g. plain Node, which can't import `.ts` — it transpiles and bundles the config with
 * esbuild and imports the result. Throws a `configError` (with a hint) if the file is missing or
 * doesn't default-export a config.
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<VibeConfig> {
  const file = findConfig(cwd)
  if (!file) {
    throw withHint(
      configError(`No vibe.config.* found in ${resolve(cwd)}.`),
      `Create one that default-exports defineConfig({ name: "my-app" }). Expected file names: ${CONFIG_NAMES.join(", ")}.`,
    )
  }

  let mod: { default?: VibeConfig }
  try {
    // `@vite-ignore`: a genuine runtime import of a user file — bundlers/vitest must
    // not analyze or transform it.
    mod = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as { default?: VibeConfig }
  } catch (error) {
    // A TS config under a runtime that can't import `.ts` directly — transpile and retry.
    if (!TS_CONFIG.test(file)) {
      throw configError(`Failed to load ${file}.`, error instanceof Error ? error : undefined)
    }
    mod = await loadViaEsbuild(file)
  }

  if (!mod.default || typeof mod.default !== "object") {
    throw withHint(
      configError(`${file} does not export a config.`),
      "It must `export default defineConfig({ ... })`.",
    )
  }
  return mod.default
}

/**
 * Bundle a TS config to a temp ESM module with esbuild, then import it. Bundling (not just
 * transpiling) so a config that imports agents/tools/providers resolves. The temp file is written
 * to the OS temp dir and removed after import.
 */
async function loadViaEsbuild(file: string): Promise<{ default?: VibeConfig }> {
  const out = join(tmpdir(), `vibe.config.${process.pid}.${basename(file)}.mjs`)
  try {
    await esbuild({
      entryPoints: [file],
      outfile: out,
      bundle: true,
      format: "esm",
      platform: "node",
      // Keep node built-ins and installed deps external; only the user's own TS graph is bundled.
      packages: "external",
      logLevel: "silent",
    })
    return (await import(/* @vite-ignore */ pathToFileURL(out).href)) as { default?: VibeConfig }
  } catch (error) {
    throw configError(`Failed to load ${file}.`, error instanceof Error ? error : undefined)
  } finally {
    rmSync(out, { force: true })
  }
}

/** The conventional subdirectories a Vibe app auto-discovers. */
export const APP_DIRS = { agents: "agents", tools: "tools" } as const

/** True if `dir` looks like a Vibe app (has a config or an agents/ or tools/ dir). */
export function isVibeApp(dir: string): boolean {
  return (
    findConfig(dir) !== undefined ||
    existsSync(join(dir, APP_DIRS.agents)) ||
    existsSync(join(dir, APP_DIRS.tools))
  )
}
