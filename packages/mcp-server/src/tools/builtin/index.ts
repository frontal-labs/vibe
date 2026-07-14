import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import type { AnyTool } from "@vibe/tools"
import { defineTool } from "@vibe/tools"
import { z } from "zod"

import { exec } from "../../lib/exec"
import { resolveWithin } from "../../lib/path"

/**
 * The tools the agent loop can call to operate Vibe: read files, list
 * directories, and run scoped commands (build/test/lint). All paths are
 * resolved against the workspace root, so the loop can't stray outside it.
 */
export function createBuiltinTools(repoRoot: string): AnyTool[] {
  return [
    defineTool({
      name: "read_file",
      description: "Read a UTF-8 text file from the workspace. Returns its contents.",
      schema: z.object({
        path: z.string().describe("Workspace-relative path, e.g. 'packages/core/src/system.ts'."),
      }),
      execute({ path }) {
        const full = resolveWithin(repoRoot, path)
        return readFileSync(full, "utf8")
      },
    }),

    defineTool({
      name: "list_dir",
      description: "List the entries of a directory in the workspace.",
      schema: z.object({
        path: z
          .string()
          .describe("Workspace-relative directory, e.g. 'packages'. Defaults to repo root.")
          .default("."),
      }),
      execute({ path }) {
        const full = resolveWithin(repoRoot, path)
        const entries = readdirSync(full).map((name) => {
          let type = "file"
          try {
            if (statSync(join(full, name)).isDirectory()) type = "dir"
          } catch {
            type = "unknown"
          }
          return { name, type }
        })
        return JSON.stringify(entries, null, 2)
      },
    }),

    defineTool({
      name: "run_command",
      description:
        "Run a shell command inside the workspace (e.g. 'bun', 'node', 'cargo'). stdout/stderr/exitCode are returned. Use for building, testing, and linting Vibe.",
      schema: z.object({
        command: z.string().describe("The executable to run, e.g. 'bun'."),
        args: z.array(z.string()).default([]).describe("Arguments passed to the command."),
        cwd: z
          .string()
          .optional()
          .describe("Workspace-relative working directory. Defaults to the repo root."),
        timeoutMs: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Kill the command after this many ms."),
      }),
      async execute({ command, args, cwd, timeoutMs }) {
        const result = await exec(command, args, {
          cwd: resolveWithin(repoRoot, cwd ?? "."),
          timeoutMs,
        })
        return JSON.stringify(result, null, 2)
      },
    }),
  ]
}
