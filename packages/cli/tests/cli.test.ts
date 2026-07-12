import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Compiler } from "@vibe/compiler"
import { describe, expect, it } from "vitest"

import { buildFile, checkFile, formatFile } from "../src/actions"
import { createProgram } from "../src/program"

const compiler: Compiler = {
  compile: () => ({
    typescript: "export const x = 1",
    declarations: "declare const x: number",
    sourceMap: { version: 3 },
    hasErrors: false,
    diagnostics: [],
  }),
  check: (src) => ({
    errorCount: src.includes("BAD") ? 1 : 0,
    warningCount: 0,
    diagnostics: src.includes("BAD")
      ? [{ code: "VB2001", severity: "error", line: 1, col: 1, message: "bad", help: null }]
      : [],
  }),
  format: (src) => src.replace(/\s+$/, "\n"),
  version: () => "0.0.0",
}

function withTmp<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "vibe-cli-"))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
}

describe("actions", () => {
  it("buildFile emits ts/d.ts/map into the out dir", () => {
    withTmp((dir) => {
      const file = join(dir, "app.vibe")
      writeFileSync(file, "agent A {}")
      const result = buildFile(compiler, file, ".vibe")
      expect(result.outputs).toHaveLength(3)
      expect(readFileSync(join(dir, ".vibe", "app.ts"), "utf8")).toBe("export const x = 1")
    })
  })

  it("checkFile surfaces diagnostics", () => {
    withTmp((dir) => {
      const file = join(dir, "bad.vibe")
      writeFileSync(file, "BAD")
      expect(checkFile(compiler, file)).toHaveLength(1)
    })
  })

  it("formatFile writes when changed, or reports with --check", () => {
    withTmp((dir) => {
      const file = join(dir, "f.vibe")
      writeFileSync(file, "agent A {}   ")
      expect(formatFile(compiler, file, { check: true }).changed).toBe(true)
      expect(readFileSync(file, "utf8")).toBe("agent A {}   ")
      expect(formatFile(compiler, file).changed).toBe(true)
      expect(readFileSync(file, "utf8").endsWith("\n")).toBe(true)
    })
  })
})

describe("createProgram", () => {
  it("wires the check command and reports errors", async () => {
    await withTmp(async (dir) => {
      writeFileSync(join(dir, "bad.vibe"), "BAD")
      const lines: string[] = []
      let failure: string | undefined
      const program = createProgram({
        compiler,
        templatesDir: dir,
        log: (l) => lines.push(l),
        onError: (m) => {
          failure = m
        },
      })
      await program.parseAsync(["node", "vibe", "check", dir])
      expect(lines.some((l) => l.includes("VB2001"))).toBe(true)
      expect(failure).toContain("error")
    })
  })
})
