import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { renderTemplate, renderTree } from "../src/render"
import { scaffold } from "../src/scaffold"

const TEMPLATES = join(__dirname, "..", "..", "templates")

describe("renderTemplate", () => {
  it("interpolates data without HTML-escaping", () => {
    expect(renderTemplate('name "{{name}}"', { name: "acme & co" })).toBe('name "acme & co"')
  })
})

describe("renderTree", () => {
  it("renders paths and content, stripping .hbs", () => {
    const out = renderTree(
      { "src/{{name}}.ts.hbs": "export const n = '{{name}}'" },
      { name: "cache" },
    )
    expect(out).toEqual({ "src/cache.ts": "export const n = 'cache'" })
  })
})

describe("scaffold", () => {
  it("renders the project template to a target directory", () => {
    const root = mkdtempSync(join(tmpdir(), "vibe-gen-"))
    try {
      const written = scaffold(join(TEMPLATES, "project"), join(root, "app"), { name: "my-app" })
      expect(written.length).toBeGreaterThan(0)
      const config = readFileSync(join(root, "app", "vibe.config.ts"), "utf8")
      expect(config).toContain('name: "my-app"')
      const agent = readFileSync(join(root, "app", "agents", "assistant.ts"), "utf8")
      expect(agent).toContain("createAgent")
      const pkg = JSON.parse(readFileSync(join(root, "app", "package.json"), "utf8")) as {
        name: string
      }
      expect(pkg.name).toBe("my-app")
      expect(existsSync(join(root, "app", "tools", "greet.ts"))).toBe(true)
      expect(existsSync(join(root, "app", ".gitignore"))).toBe(true)
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })

  it("refuses a non-empty target unless forced", () => {
    const root = mkdtempSync(join(tmpdir(), "vibe-gen-"))
    try {
      scaffold(join(TEMPLATES, "minimal"), join(root, "a"), { name: "x" })
      expect(() => scaffold(join(TEMPLATES, "minimal"), join(root, "a"), { name: "x" })).toThrow(
        /not empty/,
      )
      expect(() =>
        scaffold(join(TEMPLATES, "minimal"), join(root, "a"), { name: "x" }, { force: true }),
      ).not.toThrow()
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})
