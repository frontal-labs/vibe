import { listPackages } from "./lib/workspace"
import type { ToolContext } from "./types"

export interface McpResource {
  readonly uri: string
  readonly name: string
  readonly mimeType: string
  readonly description: string
}

export const resources: readonly McpResource[] = [
  {
    uri: "vibe://packages",
    name: "Workspace packages",
    mimeType: "application/json",
    description: "The @vibe/* package list and acyclic dependency graph.",
  },
  {
    uri: "vibe://model-catalog",
    name: "Model catalog",
    mimeType: "application/json",
    description: "Default model id and effort modes.",
  },
  {
    uri: "vibe://runtime/status",
    name: "Runtime status",
    mimeType: "application/json",
    description: "Live Vibe system status.",
  },
] as const

const MODEL_CATALOG = {
  defaultModel: "claude-opus-4-8",
  efforts: ["low", "medium", "high", "xhigh", "max"],
  note: "Adaptive thinking is the default reasoning mode. See docs/specs/model-spec.md.",
}

/** Read a resource by URI, scoped to the workspace. */
export async function readResource(uri: string, ctx: ToolContext): Promise<string> {
  switch (uri) {
    case "vibe://packages": {
      const packages = listPackages(ctx.repoRoot)
      return JSON.stringify({ packageCount: packages.length, packages }, null, 2)
    }
    case "vibe://model-catalog":
      return JSON.stringify(MODEL_CATALOG, null, 2)
    case "vibe://runtime/status":
      return JSON.stringify(await ctx.session.status(), null, 2)
    default:
      throw new Error(`Unknown resource: ${uri}`)
  }
}
