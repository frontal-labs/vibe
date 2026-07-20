#!/usr/bin/env node
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import chokidar from "chokidar"
import { createDevBuilder, type DevBuilder } from "vibe/build"
import { formatDiagnostic } from "vibe/errors"

import { buildApp, summarizeManifest } from "./actions"
import { createProgram } from "./program"

/** Best-effort locate `tools/templates`: env override, else walk up for the monorepo. */
function resolveTemplatesDir(): string {
  if (process.env.VIBE_TEMPLATES_DIR) {
    return process.env.VIBE_TEMPLATES_DIR
  }
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, "tools", "templates")
    if (existsSync(candidate)) {
      return candidate
    }
    dir = resolve(dir, "..")
  }
  return join(process.cwd(), "tools", "templates")
}

function main(): void {
  const program = createProgram({ build: buildApp, templatesDir: resolveTemplatesDir() })

  // `dev` watches `agents/`, `tools/`, `skills/`, `workflows/`, and the config, rebuilding
  // incrementally via a warm esbuild context. Kept out of the testable program (needs chokidar/IO).
  program
    .command("dev")
    .description("Watch the app and rebuild on change")
    .argument("[dir]", "app directory", ".")
    .action((dir: string) => {
      const configFile = join(dir, "vibe.config.ts")
      // A change is "structural" when the set of entries could change (a file added/removed, or the
      // config edited) — that needs a re-plan; a plain edit to an existing entry just rebuilds.
      const isConfig = (path: string): boolean =>
        path === configFile || path.endsWith("vibe.config.ts")

      let builder: DevBuilder | null = null
      const build = async (structural: boolean): Promise<void> => {
        try {
          if (!builder) {
            builder = await createDevBuilder(dir, {})
            console.log(summarizeManifest(await builder.rebuild()))
            return
          }
          const manifest = structural ? await builder.reload() : await builder.rebuild()
          console.log(summarizeManifest(manifest))
        } catch (error) {
          console.error(formatDiagnostic(error))
        }
      }

      console.log(`watching ${dir} …`)
      build(false).catch(() => {
        // build() already logs its own diagnostics; nothing to surface here.
      })
      chokidar
        .watch(
          [
            join(dir, "agents"),
            join(dir, "tools"),
            join(dir, "skills"),
            join(dir, "workflows"),
            configFile,
          ],
          { ignoreInitial: true },
        )
        .on("add", () => build(true))
        .on("unlink", () => build(true))
        .on("change", (path: string) => build(isConfig(path)))
    })

  program.parse()
}

main()
