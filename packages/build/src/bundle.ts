import { readFileSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import {
  type BuildOptions as EsbuildOptions,
  build as esbuild,
  context as esbuildContext,
  type Metafile,
} from "esbuild"
import { agentsMissingError } from "vibe/errors"

import { discoverApp } from "./discover"
import { toolEdges } from "./graph"
import { toManifest } from "./manifest"
import type { AppEntry, AppGraph, BuildManifest, BuildOptions, BuildTarget } from "./types"

/** Code skills are source modules; `.md` procedure skills are data, not bundled. */
function isSourceEntry(entry: AppEntry): boolean {
  return !entry.file.endsWith(".md")
}

/** The imported tool specifiers for one entry (oxc/TS analysis), keyed for the manifest. */
function toolsOf(entry: AppEntry): string[] {
  try {
    return toolEdges(readFileSync(entry.file, "utf8")).map((e) => e.source)
  } catch {
    return []
  }
}

/**
 * The entry→tool graph across agents, code skills, and workflows, keyed by the
 * esbuild output key (`<name>`, `skills/<name>`, `workflows/<name>`).
 */
function entryToolGraph(graph: AppGraph): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const agent of graph.agents) out[agent.name] = toolsOf(agent)
  for (const skill of graph.skills.filter(isSourceEntry))
    out[`skills/${skill.name}`] = toolsOf(skill)
  for (const workflow of graph.workflows) out[`workflows/${workflow.name}`] = toolsOf(workflow)
  return out
}

/** Deps kept external per target (never bundled into the cold-start payload). */
function externalsFor(target: BuildTarget, extra: string[] = []): string[] {
  const node = ["node:*"]
  switch (target) {
    case "edge":
    case "cloudflare":
    case "vercel":
      // Edge runtimes: bundle everything, externalize nothing by default.
      return extra
    default:
      return [...node, ...extra]
  }
}

/**
 * Build an app into optimized, tree-shaken, code-split serverless bundles.
 *
 * Each agent under `agents/`, code skill under `skills/`, and workflow under
 * `workflows/` is its own esbuild **entry point**, so:
 * - **tree-shaking** drops any tool/agent/skill/workflow no entry reaches, and each
 *   entry bundles only the tools it actually imports;
 * - **code-splitting** (`splitting: true`) hoists code shared across entries into
 *   separate chunks, shrinking each function's cold-start payload;
 * - a `manifest.json` records the entry + chunks + byte size per agent, and per
 *   skill/workflow (emitted under `dist/skills/*` and `dist/workflows/*`).
 */
/** A resolved build plan: the discovered graph plus the exact esbuild invocation. */
export interface BuildPlan {
  graph: AppGraph
  outDir: string
  target: BuildTarget
  esbuild: EsbuildOptions & { metafile: true }
}

/**
 * Resolve a build plan from an app directory: discover the graph, fold in config/CLI options, and
 * assemble the esbuild invocation. Shared by the one-shot {@link bundleApp} and the incremental
 * dev builder so both produce identical output.
 */
export async function planBuild(root: string, options: BuildOptions = {}): Promise<BuildPlan> {
  const graph = await discoverApp(root)
  const outDir = join(root, options.outDir ?? graph.config?.build?.outDir ?? "dist")
  const target = options.target ?? graph.config?.build?.target ?? "node"
  const minify = options.minify ?? graph.config?.build?.minify ?? true

  if (graph.agents.length === 0) {
    throw agentsMissingError(join(root, "agents"))
  }

  // Object-form entry keys become output paths (relative to outDir), so agents stay
  // flat at `dist/<name>.js` while skills/workflows are namespaced into subdirs.
  const entryPoints: Record<string, string> = {
    ...Object.fromEntries(graph.agents.map((a) => [a.name, a.file])),
    ...Object.fromEntries(
      graph.skills.filter(isSourceEntry).map((s) => [`skills/${s.name}`, s.file]),
    ),
    ...Object.fromEntries(graph.workflows.map((w) => [`workflows/${w.name}`, w.file])),
  }

  return {
    graph,
    outDir,
    target,
    esbuild: {
      entryPoints,
      outdir: outDir,
      bundle: true,
      splitting: true,
      format: "esm",
      platform: target === "node" || target === "lambda" ? "node" : "neutral",
      treeShaking: true,
      minify,
      metafile: true,
      sourcemap: false,
      external: externalsFor(target, options.external),
      logLevel: "silent",
    },
  }
}

/** Write `manifest.json` for a finished esbuild run and return the manifest. */
function emitManifest(plan: BuildPlan, metafile: Metafile): BuildManifest {
  const manifest = toManifest(
    plan.graph,
    plan.target,
    plan.outDir,
    metafile,
    entryToolGraph(plan.graph),
  )
  writeFileSync(join(plan.outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

export async function bundleApp(root: string, options: BuildOptions = {}): Promise<BuildManifest> {
  const plan = await planBuild(root, options)
  const result = await esbuild(plan.esbuild)
  return emitManifest(plan, result.metafile)
}

/** An incremental builder for `vibe dev`: reuses esbuild's warm state across rebuilds. */
export interface DevBuilder {
  /** Rebuild using the warm esbuild context (fast — only changed inputs are reprocessed). */
  rebuild(): Promise<BuildManifest>
  /**
   * Re-plan and rebuild from scratch. Call when the set of entries changes (an agent/skill/workflow
   * file was added or removed) or `vibe.config.*` changed, since the entry points are then stale.
   */
  reload(): Promise<BuildManifest>
  /** Tear down the esbuild context. */
  dispose(): Promise<void>
}

/**
 * Create an incremental dev builder. Unlike {@link bundleApp}, which spins up esbuild fresh each
 * call, this holds a warm `esbuild.context` so a rebuild on save reprocesses only what changed —
 * the difference between a multi-second rebundle and a near-instant one on a large app.
 */
export async function createDevBuilder(
  root: string,
  options: BuildOptions = {},
): Promise<DevBuilder> {
  let plan = await planBuild(root, options)
  let ctx = await esbuildContext(plan.esbuild)

  const run = async (): Promise<BuildManifest> => {
    const result = await ctx.rebuild()
    return emitManifest(plan, result.metafile)
  }

  return {
    rebuild: run,
    reload: async () => {
      await ctx.dispose()
      plan = await planBuild(root, options)
      ctx = await esbuildContext(plan.esbuild)
      return run()
    },
    dispose: () => ctx.dispose(),
  }
}

/** The set of source files esbuild included, relative to `root` (for tree-shake assertions). */
export function includedInputs(
  metafile: { inputs: Record<string, unknown> },
  root: string,
): string[] {
  return Object.keys(metafile.inputs).map((p) => relative(root, p))
}
