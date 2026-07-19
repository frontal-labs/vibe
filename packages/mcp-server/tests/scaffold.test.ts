import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { expect, test } from "vitest"

import { scaffoldAgent, scaffoldPackage } from "../src/lib/scaffold"

test("scaffoldPackage creates convention files", () => {
  const root = mkdtempSync(join(tmpdir(), "vibe-"))
  try {
    const files = scaffoldPackage(root, "cache")
    expect(files.length).toBe(5)

    const pkg = JSON.parse(
      readFileSync(join(root, "packages", "cache", "package.json"), "utf8"),
    ) as { name?: string }
    expect(pkg.name).toBe("vibe/cache")
    expect(existsSync(join(root, "packages", "cache", "src", "index.ts"))).toBe(true)
    expect(existsSync(join(root, "packages", "cache", "vite.config.ts"))).toBe(true)
    expect(existsSync(join(root, "packages", "cache", "tsconfig.json"))).toBe(true)
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("scaffoldPackage refuses existing names", () => {
  const root = mkdtempSync(join(tmpdir(), "vibe-"))
  try {
    scaffoldPackage(root, "cache")
    expect(() => scaffoldPackage(root, "cache")).toThrow()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test("scaffoldAgent creates a runnable example module", () => {
  const root = mkdtempSync(join(tmpdir(), "vibe-"))
  try {
    const files = scaffoldAgent(root, "triage")
    expect(files.length).toBe(1)
    const content = readFileSync(files[0]!, "utf8")
    expect(content).toContain("createTriageAgent")
    expect(content).toContain("defineTool")
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})
