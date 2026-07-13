import { basename, relative } from "node:path"

import type { AppGraph, BuildManifest, BuildTarget, EntryBundle } from "./types"

interface Metafile {
  readonly outputs: Record<
    string,
    { readonly bytes: number; readonly entryPoint?: string; readonly imports?: { path: string }[] }
  >
}

/**
 * Build the manifest from esbuild's metafile + the entry→tool graph. Entries are
 * categorized by output path: `skills/<name>.js` and `workflows/<name>.js` are
 * split into their own manifest buckets; everything else is an agent.
 */
export function toManifest(
  graph: AppGraph,
  target: BuildTarget,
  outDir: string,
  metafile: Metafile,
  entryTools: Record<string, string[]> = {},
): BuildManifest {
  const agents: Record<string, EntryBundle> = {}
  const skills: Record<string, EntryBundle> = {}
  const workflows: Record<string, EntryBundle> = {}
  const chunks = new Set<string>()
  let totalBytes = 0

  for (const [outPath, out] of Object.entries(metafile.outputs)) {
    const rel = relative(outDir, outPath)
    totalBytes += out.bytes
    if (out.entryPoint) {
      // Output key (matches the esbuild entry key), e.g. `alpha` or `skills/x`.
      const key = rel.replace(/\.js$/, "")
      const name = basename(key)
      const bundle: EntryBundle = {
        name,
        entry: rel,
        bytes: out.bytes,
        chunks: (out.imports ?? []).map((i) => relative(outDir, i.path)),
        tools: entryTools[key] ?? [],
      }
      if (key.startsWith("skills/")) skills[name] = bundle
      else if (key.startsWith("workflows/")) workflows[name] = bundle
      else agents[name] = bundle
    } else if (rel.endsWith(".js")) {
      chunks.add(rel)
    }
  }

  return {
    app: graph.config?.name ?? basename(graph.root),
    target,
    agents,
    skills,
    workflows,
    chunks: [...chunks].sort(),
    totalBytes,
  }
}
