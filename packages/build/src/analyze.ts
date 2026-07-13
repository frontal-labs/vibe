import type { BuildManifest, EntryBundle } from "./types"

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`

function section(label: string, bundles: Record<string, EntryBundle> = {}): string[] {
  const names = Object.keys(bundles).sort()
  if (names.length === 0) return []
  const width = Math.max(label.length, ...names.map((n) => n.length))
  const lines = [`  ${label.padEnd(width)}  cold-start`]
  for (const name of names) {
    const bundle = bundles[name]
    if (bundle) lines.push(`  ${name.padEnd(width)}  ${kb(bundle.bytes)}`)
  }
  lines.push("")
  return lines
}

/**
 * A human-readable cold-start size report: per-agent/skill/workflow entry size
 * (its cold-start payload) plus shared chunks and the total. Printed by
 * `vibe build --analyze`.
 */
export function formatAnalysis(manifest: BuildManifest): string {
  const lines: string[] = [`${manifest.app} (${manifest.target})`, ""]
  lines.push(...section("agent", manifest.agents))
  lines.push(...section("skill", manifest.skills))
  lines.push(...section("workflow", manifest.workflows))
  lines.push(`  shared chunks: ${manifest.chunks.length}`, `  total: ${kb(manifest.totalBytes)}`)
  return lines.join("\n")
}
