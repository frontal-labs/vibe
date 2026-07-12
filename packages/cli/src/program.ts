import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import type { Compiler } from "@vibe/compiler"
import { scaffold } from "@vibe/generators"
import { Command } from "commander"

import { buildFile, checkFile, formatDiagnostic, formatFile, infoFile } from "./actions"

export interface ProgramDeps {
  readonly compiler: Compiler
  /** Directory holding the Handlebars scaffold templates (tools/templates). */
  readonly templatesDir: string
  /** Where output goes (defaults to console). */
  readonly log?: (line: string) => void
  /** Called instead of exiting on error, so the program is testable. */
  readonly onError?: (message: string) => void
}

/** Find `.vibe` files under a path (a file returns itself). */
function vibeFiles(path: string): string[] {
  if (statSync(path).isFile()) {
    return path.endsWith(".vibe") ? [path] : []
  }
  const out: string[] = []
  for (const entry of readdirSync(path)) {
    const full = join(path, entry)
    if (statSync(full).isDirectory()) out.push(...vibeFiles(full))
    else if (full.endsWith(".vibe")) out.push(full)
  }
  return out
}

/** Build the `vibe` commander program. Deps are injected so it's fully testable. */
export function createProgram(deps: ProgramDeps): Command {
  const log = deps.log ?? console.log
  const fail =
    deps.onError ??
    ((m: string) => {
      process.exitCode = 1
      console.error(m)
    })
  const program = new Command()
  program.name("vibe").description("The Vibe language toolchain").version(deps.compiler.version())

  program
    .command("build")
    .argument("[path]", "file or directory", ".")
    .option("-o, --out-dir <dir>", "output directory", ".vibe")
    .action((path: string, opts: { outDir: string }) => {
      let errors = 0
      for (const file of vibeFiles(path)) {
        const result = buildFile(deps.compiler, file, opts.outDir)
        for (const d of result.diagnostics) {
          log(formatDiagnostic(file, d))
          if (d.severity === "error") errors++
        }
        log(`✓ ${file} → ${result.outputs.length} file(s)`)
      }
      if (errors > 0) fail(`${errors} error(s)`)
    })

  program
    .command("check")
    .argument("[path]", "file or directory", ".")
    .action((path: string) => {
      let errors = 0
      for (const file of vibeFiles(path)) {
        for (const d of checkFile(deps.compiler, file)) {
          log(formatDiagnostic(file, d))
          if (d.severity === "error") errors++
        }
      }
      log(errors === 0 ? "✓ no errors" : `✗ ${errors} error(s)`)
      if (errors > 0) fail(`${errors} error(s)`)
    })

  program
    .command("fmt")
    .argument("[path]", "file or directory", ".")
    .option("--check", "report unformatted files instead of writing", false)
    .action((path: string, opts: { check: boolean }) => {
      let changed = 0
      for (const file of vibeFiles(path)) {
        if (formatFile(deps.compiler, file, { check: opts.check }).changed) {
          changed++
          log(`${opts.check ? "would format" : "formatted"} ${file}`)
        }
      }
      if (opts.check && changed > 0) fail(`${changed} file(s) need formatting`)
    })

  program
    .command("new")
    .argument("<name>", "project name")
    .option("-t, --template <template>", "template: minimal | tool | multi | project", "project")
    .action((name: string, opts: { template: string }) => {
      const templateDir = join(deps.templatesDir, opts.template)
      const created = scaffold(templateDir, name, { name })
      log(`✓ created ${name}/ (${created.length} files) from "${opts.template}"`)
    })

  program
    .command("info")
    .argument("[path]", "file or directory", ".")
    .action((path: string) => {
      for (const file of vibeFiles(path)) log(infoFile(deps.compiler, file))
    })

  return program
}
