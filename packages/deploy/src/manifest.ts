/**
 * Consume a `@vibe/build` manifest to plan per-target serverless deployment. Kept
 * structurally decoupled from `@vibe/build` (no esbuild dep here): any object with
 * this shape works.
 */
export interface DeployManifestAgent {
  readonly name: string
  readonly entry: string
  readonly bytes: number
  readonly tools?: string[]
}

export interface DeployManifest {
  readonly app: string
  readonly target: string
  readonly agents: Record<string, DeployManifestAgent>
}

export type DeployTarget = "node" | "bun" | "edge" | "cloudflare" | "vercel" | "lambda"

export interface DeployPlanOptions {
  readonly target?: DeployTarget
  /** Warn when an agent's cold-start payload exceeds this many KB. */
  readonly maxColdStartKB?: number
}

/** One agent's deployment: its entry, the wrapper handler, and cold-start size. */
export interface AgentDeployment {
  readonly name: string
  readonly entry: string
  readonly coldStartKB: number
  readonly withinBudget: boolean
  /** The per-target handler module source that mounts the built agent. */
  readonly handler: string
}

export interface DeployPlan {
  readonly app: string
  readonly target: DeployTarget
  readonly agents: AgentDeployment[]
  /** True when every agent is within `maxColdStartKB`. */
  readonly withinBudget: boolean
  readonly totalKB: number
}

/** Generate the per-target handler module that mounts a built agent bundle. */
export function generateHandler(agentEntry: string, target: DeployTarget): string {
  const importLine = `import agent from "./${agentEntry}"`
  switch (target) {
    case "cloudflare":
      return `${importLine}\nimport { toCloudflareWorker } from "@vibe/deploy"\nexport default toCloudflareWorker(agent)\n`
    case "lambda":
      return `${importLine}\nimport { toLambdaHandler } from "@vibe/deploy"\nexport const handler = toLambdaHandler(agent)\n`
    case "vercel":
    case "edge":
      return `${importLine}\nimport { toVercelHandler } from "@vibe/deploy"\nexport default toVercelHandler(agent)\n`
    default:
      return `${importLine}\nimport { toNodeListener } from "@vibe/adapters"\nimport { createServer } from "node:http"\ncreateServer(toNodeListener(agent)).listen(Number(process.env.PORT ?? 3000))\n`
  }
}

/**
 * Plan a deployment from a build manifest: one handler per agent, each sized by its
 * cold-start payload, with a budget check. Pair with `vibe build` output.
 */
export function deployPlan(manifest: DeployManifest, options: DeployPlanOptions = {}): DeployPlan {
  const target = options.target ?? (manifest.target as DeployTarget) ?? "node"
  const budget = options.maxColdStartKB ?? Number.POSITIVE_INFINITY

  let totalBytes = 0
  const agents: AgentDeployment[] = Object.values(manifest.agents)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((a) => {
      totalBytes += a.bytes
      const coldStartKB = a.bytes / 1024
      return {
        name: a.name,
        entry: a.entry,
        coldStartKB,
        withinBudget: coldStartKB <= budget,
        handler: generateHandler(a.entry, target),
      }
    })

  return {
    app: manifest.app,
    target,
    agents,
    withinBudget: agents.every((a) => a.withinBudget),
    totalKB: totalBytes / 1024,
  }
}
