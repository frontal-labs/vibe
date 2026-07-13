import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { defineConfig } from "../src/define-config"
import { findConfig, isVibeApp, loadConfig } from "../src/load-config"
import { mergeConfig } from "../src/merge"

describe("defineConfig", () => {
  it("returns the config unchanged (identity)", () => {
    const c = defineConfig({ name: "app", provider: "anthropic", model: "claude-opus-4-8" })
    expect(c.name).toBe("app")
  })
})

describe("mergeConfig", () => {
  it("later layers win; arrays concat; objects shallow-merge", () => {
    const merged = mergeConfig(
      { name: "a", model: "claude-opus-4-8", build: { minify: true } },
      { name: "b", build: { outDir: "out" } },
    )
    expect(merged.name).toBe("b")
    expect(merged.model).toBe("claude-opus-4-8")
    expect(merged.build).toEqual({ minify: true, outDir: "out" })
  })
})

async function withApp<T>(
  files: Record<string, string>,
  fn: (dir: string) => T | Promise<T>,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "vibe-cfg-"))
  try {
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content)
    // `await` so the temp dir survives until an async `fn` (e.g. loadConfig) resolves — otherwise
    // `finally` would delete it mid-flight.
    return await fn(dir)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
}

describe("loadConfig / findConfig / isVibeApp", () => {
  const fixtureApp = join(__dirname, "fixtures", "app")

  it("finds and loads a vibe.config.mjs default export", async () => {
    expect(findConfig(fixtureApp)?.endsWith("vibe.config.mjs")).toBe(true)
    expect(isVibeApp(fixtureApp)).toBe(true)
    const cfg = await loadConfig(fixtureApp)
    expect(cfg.name).toBe("loaded")
  })

  it("throws when no config exists", async () => {
    await withApp({}, async (dir) => {
      expect(findConfig(dir)).toBeUndefined()
      await expect(loadConfig(dir)).rejects.toThrow(/No vibe.config/)
    })
  })

  it("loads a TypeScript config with TS-only syntax", async () => {
    // The fixture uses a type alias + annotation — TS-only syntax. Under a TS-aware runtime it
    // imports directly; under plain Node it goes through the esbuild transpile fallback. Either way
    // `loadConfig` returns the config. (The plain-Node fallback path is exercised end-to-end by the
    // node-runner check in the verification steps, outside vitest's Vite import layer.)
    const tsApp = join(__dirname, "fixtures", "ts-app")
    const cfg = await loadConfig(tsApp)
    expect(cfg.name).toBe("ts-loaded")
    expect(cfg.model).toBe("claude-opus-4-8")
  })
})
