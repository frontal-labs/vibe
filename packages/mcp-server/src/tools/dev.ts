import { z } from "zod"
import { resolveWithin } from "../lib/path"
import type { McpTool } from "../types"

const listDirTool: McpTool = {
  name: "list_dir",
  description: "List the entries of a directory in the workspace.",
  schema: z.object({
    path: z
      .string()
      .describe("Workspace-relative directory, e.g. 'packages'. Defaults to repo root.")
      .default("."),
  }),
  execute: async ({ path }, ctx) => {
    const full = resolveWithin(ctx.repoRoot, path)
    const { readdirSync, statSync } = await import("node:fs")
    const entries = readdirSync(full).map((name) => {
      let type = "file"
      try {
        if (statSync(`${full}/${name}`).isDirectory()) type = "dir"
      } catch {
        type = "unknown"
      }
      return { name, type }
    })
    return JSON.stringify(entries, null, 2)
  },
}

export const devTools: McpTool[] = [listDirTool]
