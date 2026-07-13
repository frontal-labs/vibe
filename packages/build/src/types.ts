import type { VibeConfig } from "@vibe/config"

/** A discovered agent or tool module: its export name and source file. */
export interface AppEntry {
  readonly name: string
  readonly file: string
}

/** The resolved app graph: config + the agents/tools/skills/workflows to build. */
export interface AppGraph {
  readonly root: string
  readonly config: VibeConfig | undefined
  readonly agents: readonly AppEntry[]
  readonly tools: readonly AppEntry[]
  /** Discovered skills — `.ts`/`.js` (code) and `.md` (procedure) — from `skills/`. */
  readonly skills: readonly AppEntry[]
  /** Discovered workflows from `workflows/` (each default-exports one). */
  readonly workflows: readonly AppEntry[]
}

/** Runtime target — controls which deps are externalized. */
export type BuildTarget = "node" | "bun" | "edge" | "cloudflare" | "vercel" | "lambda"

export interface BuildOptions {
  readonly outDir?: string
  readonly target?: BuildTarget
  readonly minify?: boolean
  /** Extra modules to keep external (not bundled). */
  readonly external?: string[]
}

/** Per-entry bundle stats + the tools it uses (the entry→tool graph). */
export interface EntryBundle {
  readonly name: string
  readonly entry: string
  readonly bytes: number
  readonly chunks: string[]
  /** Tool module specifiers this entry imports (from the oxc/TS analysis). */
  readonly tools: string[]
}

/** Back-compat alias — agents are just entries. */
export type AgentBundle = EntryBundle

/**
 * The build manifest: one entry per agent (`dist/<name>.js`), per code skill
 * (`dist/skills/<name>.js`), and per workflow (`dist/workflows/<name>.js`), plus
 * shared chunks and total size. Each entry is its own code-split boundary.
 */
export interface BuildManifest {
  readonly app: string
  readonly target: BuildTarget
  readonly agents: Record<string, EntryBundle>
  readonly skills: Record<string, EntryBundle>
  readonly workflows: Record<string, EntryBundle>
  readonly chunks: string[]
  readonly totalBytes: number
}
