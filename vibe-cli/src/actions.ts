import type { BuildManifest, BuildOptions } from "vibe/build"
import { bundleApp, discoverApp, formatAnalysis } from "vibe/build"

/** Build an app directory into optimized, tree-shaken, code-split bundles. */
export function buildApp(root: string, options: BuildOptions = {}): Promise<BuildManifest> {
  return bundleApp(root, options)
}

/** A one-line summary of a built manifest (`vibe build` output). */
export function summarizeManifest(manifest: BuildManifest): string {
  const agents = Object.keys(manifest.agents).length
  const kb = (manifest.totalBytes / 1024).toFixed(1)
  return `✓ built ${agents} agent(s), ${manifest.chunks.length} shared chunk(s) — ${kb} KB total`
}

export { formatAnalysis }

/** Describe an app: its agents, tools, and config (for `vibe info`). */
export async function appInfo(root: string): Promise<string> {
  const graph = await discoverApp(root)
  const agents = graph.agents.map((a) => a.name).join(", ") || "(none)"
  const tools = graph.tools.map((t) => t.name).join(", ") || "(none)"
  return [
    `app: ${graph.config?.name ?? "(no vibe.config)"}`,
    `agents: ${agents}`,
    `tools: ${tools}`,
    `model: ${graph.config?.model ?? "(default)"}`,
  ].join("\n")
}
