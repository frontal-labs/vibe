import { nativeAddon } from "vibe/shared"

/** A tool an agent imports: its module specifier and local binding. */
export interface ToolEdge {
  readonly source: string
  readonly local: string
}

/**
 * Extract an agent module's tool imports. Uses the Rust `vibe_bundler` (oxc) addon
 * for precise parsing when available (`VIBE_NATIVE_ADDON`), else a dependency-free
 * TypeScript fallback. This agent→tool graph is what lets the bundler split by
 * agent/tool and lazily load a function's tools.
 */
export function toolEdges(agentSource: string, marker = "/tools/"): ToolEdge[] {
  const edges = nativeAddon()?.toolEdges
  if (edges) {
    try {
      return JSON.parse(edges(agentSource, marker)) as ToolEdge[]
    } catch {
      // fall through to the TS parser
    }
  }
  return fallbackToolEdges(agentSource, marker)
}

/** Regex fallback: `import Local from "…/tools/…"` default imports. */
function fallbackToolEdges(source: string, marker: string): ToolEdge[] {
  const re = /import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["']/g
  const out: ToolEdge[] = []
  let match: RegExpExecArray | null = re.exec(source)
  while (match !== null) {
    const [, local, from] = match
    if (local && from?.includes(marker)) {
      out.push({ local, source: from })
    }
    match = re.exec(source)
  }
  return out
}
