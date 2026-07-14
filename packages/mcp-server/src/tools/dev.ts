import { z } from "zod"

import { exec } from "../lib/exec"
import { resolveWithin } from "../lib/path"
import { scaffoldAgent, scaffoldPackage } from "../lib/scaffold"
import { listPackages } from "../lib/workspace"
import type { McpTool } from "../types"

/** `vibe.dev.*` — operate the Vibe monorepo: inspect the graph, scaffold, and run scripts. */
export const devTools: McpTool[] = [
  {
    name: "vibe_dev_info",
    description:
      "Summarize the Vibe monorepo: the repo root and every package with its @vibe/* dependencies (the acyclic package graph).",
    schema: z.object({}),
    // biome-ignore lint/suspicious/useAwait: interface requires Promise return
    async execute(_args, ctx) {
      return { repoRoot: ctx.repoRoot, packages: listPackages(ctx.repoRoot) }
    },
  },

  {
    name: "vibe_dev_scaffold_package",
    description:
      "Generate a new @vibe/* package following the repo conventions (package.json, tsconfig, tsup, src barrel, type-tests). Returns the created file paths.",
    schema: z.object({
      name: z.string().describe("Bare package name, e.g. 'cache' (becomes @vibe/cache)."),
    }),
    // biome-ignore lint/suspicious/useAwait: interface requires Promise return
    async execute(args, ctx) {
      return { created: scaffoldPackage(ctx.repoRoot, args.name) }
    },
  },

  {
    name: "vibe_dev_scaffold_agent",
    description:
      "Generate a runnable agent example module under examples/. Returns the created file path.",
    schema: z.object({
      name: z.string().describe("Bare agent name, e.g. 'triage'."),
    }),
    // biome-ignore lint/suspicious/useAwait: interface requires Promise return
    async execute(args, ctx) {
      return { created: scaffoldAgent(ctx.repoRoot, args.name) }
    },
  },

  {
    name: "vibe_dev_check",
    description:
      "Run a workspace script (build/test/lint/typecheck/ci:check) via bun and return stdout/stderr/exitCode. Use to verify a change is green.",
    schema: z.object({
      script: z
        .string()
        .default("ci:check")
        .describe("The bun script to run, e.g. 'test', 'lint', 'typecheck', 'ci:check'."),
      cwd: z.string().optional().describe("Workspace-relative working directory."),
      timeoutMs: z.number().int().positive().optional().describe("Kill after this many ms."),
    }),
    async execute(args, ctx) {
      const result = await exec("bun", ["run", args.script], {
        cwd: resolveWithin(ctx.repoRoot, args.cwd ?? "."),
        timeoutMs: args.timeoutMs,
      })
      return result
    },
  },
]
