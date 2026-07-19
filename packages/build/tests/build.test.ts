import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"

import { formatAnalysis } from "../src/analyze"
import { bundleApp, createDevBuilder } from "../src/bundle"
import { discoverApp } from "../src/discover"

const APP = join(__dirname, "fixtures", "app")
const OUT = join(APP, "dist")

afterAll(() => rmSync(OUT, { force: true, recursive: true }))

describe("discoverApp", () => {
  it("finds agents, tools, skills, workflows, and config via conventions", async () => {
    const graph = await discoverApp(APP)
    expect(graph.agents.map((a) => a.name).sort()).toEqual(["alpha", "beta"])
    expect(graph.tools.map((t) => t.name).sort()).toEqual(["unused", "used"])
    // code + markdown skills both discovered
    expect(graph.skills.map((s) => s.name).sort()).toEqual(["playbook", "summarize"])
    expect(graph.workflows.map((w) => w.name).sort()).toEqual(["pipeline"])
    expect(graph.config?.name).toBe("fixture-app")
  })
})

describe("bundleApp", () => {
  it("produces one bundle per agent + a manifest, tree-shaking the unused tool", async () => {
    const manifest = await bundleApp(APP, { minify: false })

    // one entry per agent (agents stay flat at dist/<name>.js)
    expect(Object.keys(manifest.agents).sort()).toEqual(["alpha", "beta"])
    expect(manifest.agents.alpha?.bytes).toBeGreaterThan(0)
    expect(existsSync(join(OUT, "manifest.json"))).toBe(true)

    // read every emitted chunk (recursively — skills/workflows live in subdirs)
    const allJs = readdirSync(OUT, { recursive: true }) as string[]
    const allOutput = allJs
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(join(OUT, f), "utf8"))
      .join("\n")

    // the used tool is bundled; the unused tool is tree-shaken away entirely
    expect(allOutput).toContain("USED_TOOL_MARKER")
    expect(allOutput).not.toContain("UNUSED_TOOL_MARKER")
  })

  it("splits code skills and workflows into their own entries (markdown skills excluded)", async () => {
    const manifest = await bundleApp(APP, { minify: false })

    // code skill + workflow each get a manifest entry; the .md procedure is not bundled
    expect(Object.keys(manifest.skills)).toEqual(["summarize"])
    expect(Object.keys(manifest.workflows)).toEqual(["pipeline"])
    expect(manifest.skills.summarize?.entry).toBe(join("skills", "summarize.js"))
    expect(manifest.workflows.pipeline?.entry).toBe(join("workflows", "pipeline.js"))

    // emitted under dist/skills and dist/workflows
    expect(existsSync(join(OUT, "skills", "summarize.js"))).toBe(true)
    expect(existsSync(join(OUT, "workflows", "pipeline.js"))).toBe(true)

    // markers present, and the skill's imported tool is tracked in the manifest
    const skillOut = readFileSync(join(OUT, "skills", "summarize.js"), "utf8")
    expect(skillOut).toContain("SKILL_MARKER")
    expect(manifest.skills.summarize?.tools).toEqual(["../tools/used"])
  })

  it("formatAnalysis reports per-agent, skill, and workflow cold-start sizes", async () => {
    const manifest = await bundleApp(APP, { minify: false })
    const report = formatAnalysis(manifest)
    expect(report).toContain("fixture-app")
    expect(report).toContain("alpha")
    expect(report).toContain("summarize")
    expect(report).toContain("pipeline")
    expect(report).toContain("total:")
  })
})

import { toolEdges } from "../src/graph"

describe("createDevBuilder (incremental)", () => {
  it("produces the same manifest as bundleApp and rebuilds from a warm context", async () => {
    const oneShot = await bundleApp(APP, { minify: false })
    const builder = await createDevBuilder(APP, { minify: false })
    try {
      const first = await builder.rebuild()
      expect(Object.keys(first.agents).sort()).toEqual(Object.keys(oneShot.agents).sort())
      // A second incremental rebuild reuses the warm esbuild context and stays consistent.
      const second = await builder.rebuild()
      expect(Object.keys(second.agents).sort()).toEqual(Object.keys(first.agents).sort())
    } finally {
      await builder.dispose()
    }
  })
})

describe("toolEdges (agent→tool graph)", () => {
  const AGENT = `
import { createAgent } from "@frontal-labs/vibe/agent"
import getOrder from "../tools/get-order"
import { z } from "zod"
export default createAgent({ tools: [getOrder] })
`
  it("extracts tool imports via the TS fallback (no native addon)", () => {
    const edges = toolEdges(AGENT)
    expect(edges).toEqual([{ local: "getOrder", source: "../tools/get-order" }])
  })

  it("uses the Rust oxc addon when VIBE_NATIVE_ADDON is set", async () => {
    const addon = join(__dirname, "..", "..", "..", "target", "release", "libvibe_napi.dylib")
    if (!existsSync(addon)) return // built addon not present in this env; TS fallback covers it
    const prev = process.env.VIBE_NATIVE_ADDON
    process.env.VIBE_NATIVE_ADDON = addon
    try {
      // fresh module instance so it re-checks the env var
      const mod = await import(`../src/graph?native=${Date.now()}`)
      const edges = mod.toolEdges(AGENT)
      expect(edges).toEqual([{ local: "getOrder", source: "../tools/get-order" }])
    } finally {
      process.env.VIBE_NATIVE_ADDON = prev
    }
  })
})
