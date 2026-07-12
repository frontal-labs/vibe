import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"

import type { Compiler, Diagnostic } from "@vibe/compiler"

/** Format a diagnostic as `file:line:col code message`. */
export function formatDiagnostic(file: string, d: Diagnostic): string {
  return `${file}:${d.line}:${d.col} ${d.severity} ${d.code} ${d.message}`
}

export interface BuildOutput {
  readonly file: string
  readonly outputs: string[]
  readonly diagnostics: readonly Diagnostic[]
}

/** Compile a `.vibe` file to `<outDir>/<name>.ts` (+ `.d.ts` + `.js.map`). */
export function buildFile(compiler: Compiler, file: string, outDir = ".vibe"): BuildOutput {
  const src = readFileSync(file, "utf8")
  const result = compiler.compile(src)
  const name = basename(file).replace(/\.vibe$/, "")
  const dir = join(dirname(file), outDir)
  mkdirSync(dir, { recursive: true })
  const outputs: string[] = []
  const tsPath = join(dir, `${name}.ts`)
  writeFileSync(tsPath, result.typescript)
  outputs.push(tsPath)
  if (result.declarations) {
    const dtsPath = join(dir, `${name}.d.ts`)
    writeFileSync(dtsPath, result.declarations)
    outputs.push(dtsPath)
  }
  if (result.sourceMap) {
    const mapPath = join(dir, `${name}.ts.map`)
    writeFileSync(mapPath, JSON.stringify(result.sourceMap))
    outputs.push(mapPath)
  }
  return { file, outputs, diagnostics: result.diagnostics }
}

/** Type-check a `.vibe` file; returns its diagnostics. */
export function checkFile(compiler: Compiler, file: string): readonly Diagnostic[] {
  return compiler.check(readFileSync(file, "utf8")).diagnostics
}

/** Format a `.vibe` file in place, or (with `check`) report whether it's formatted. */
export function formatFile(
  compiler: Compiler,
  file: string,
  options: { check?: boolean } = {},
): { changed: boolean } {
  const src = readFileSync(file, "utf8")
  const formatted = compiler.format(src)
  const changed = formatted !== src
  if (changed && !options.check) {
    writeFileSync(file, formatted)
  }
  return { changed }
}

/** A one-line project summary for `vibe info`. */
export function infoFile(compiler: Compiler, file: string): string {
  const src = readFileSync(file, "utf8")
  const check = compiler.check(src)
  return `${file}: ${check.errorCount} error(s), ${check.warningCount} warning(s) — compiler ${compiler.version()}`
}

export function ensureExists(file: string): void {
  if (!existsSync(file)) {
    throw new Error(`No such file: ${file}`)
  }
}
