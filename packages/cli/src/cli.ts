#!/usr/bin/env node
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createCompiler, loadNativeBinding } from "@vibe/compiler"
import chokidar from "chokidar"

import { buildFile } from "./actions"
import { createProgram } from "./program"

/** Best-effort locate `tools/templates`: env override, else walk up for the monorepo. */
function resolveTemplatesDir(): string {
  if (process.env.VIBE_TEMPLATES_DIR) return process.env.VIBE_TEMPLATES_DIR
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, "tools", "templates")
    if (existsSync(candidate)) return candidate
    dir = resolve(dir, "..")
  }
  return join(process.cwd(), "tools", "templates")
}

function main(): void {
  const compiler = createCompiler(loadNativeBinding())
  const program = createProgram({ compiler, templatesDir: resolveTemplatesDir() })

  // `dev` watches and rebuilds; kept out of the testable program (needs chokidar/IO).
  program
    .command("dev")
    .argument("[path]", "file or directory", ".")
    .option("-o, --out-dir <dir>", "output directory", ".vibe")
    .action((path: string, opts: { outDir: string }) => {
      const rebuild = (file: string) => {
        try {
          const result = buildFile(compiler, file, opts.outDir)
          console.log(`✓ ${file} → ${result.outputs.length} file(s)`)
        } catch (error) {
          console.error(`✗ ${file}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      console.log(`watching ${path} …`)
      chokidar
        .watch(path, { ignored: /(^|[/\\])\.vibe([/\\]|$)/, ignoreInitial: false })
        .on("add", (f) => f.endsWith(".vibe") && rebuild(f))
        .on("change", (f) => f.endsWith(".vibe") && rebuild(f))
    })

  program.parse()
}

main()
