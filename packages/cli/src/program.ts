import { join } from "node:path"

import type { BuildManifest, BuildOptions, BuildTarget } from "@vibe/build"
import { scaffold } from "@vibe/generators"
import { Command } from "commander"

import { appInfo, formatAnalysis, summarizeManifest } from "./actions"

export interface ProgramDeps {
  /** Build an app dir into optimized bundles (injected so the program is testable). */
  readonly build: (root: string, options: BuildOptions) => Promise<BuildManifest>
  /** Directory holding the Handlebars scaffold templates (tools/templates). */
  readonly templatesDir: string
  /** Where output goes (defaults to console). */
  readonly log?: (line: string) => void
  readonly version?: string
}

/**
 * Build the `vibe` commander program. Vibe apps are plain TypeScript — `build`
 * discovers `agents/`+`tools/`+`vibe.config.ts` and emits optimized, tree-shaken,
 * code-split serverless bundles. Deps are injected so the program is testable.
 */
export function createProgram(deps: ProgramDeps): Command {
  const log = deps.log ?? console.log
  const program = new Command()
  program
    .name("vibe")
    .description("The Vibe framework CLI — TypeScript-native agent apps")
    .version(deps.version ?? "0.0.0")

  program
    .command("build")
    .description("Build an app into optimized, tree-shaken, code-split bundles")
    .argument("[dir]", "app directory", ".")
    .option("-o, --out-dir <dir>", "output directory")
    .option("-t, --target <target>", "node | bun | edge | cloudflare | vercel | lambda")
    .option("--no-minify", "disable minification")
    .option("--analyze", "print per-agent cold-start sizes", false)
    .action(
      async (
        dir: string,
        opts: { outDir?: string; target?: string; minify?: boolean; analyze?: boolean },
      ) => {
        const manifest = await deps.build(dir, {
          outDir: opts.outDir,
          target: opts.target as BuildTarget | undefined,
          minify: opts.minify,
        })
        log(summarizeManifest(manifest))
        if (opts.analyze) {
          log("")
          log(formatAnalysis(manifest))
        }
      },
    )

  program
    .command("info")
    .description("Show an app's agents, tools, and config")
    .argument("[dir]", "app directory", ".")
    .action(async (dir: string) => {
      log(await appInfo(dir))
    })

  program
    .command("new")
    .description("Scaffold a new TypeScript agent app")
    .argument("<name>", "project name")
    .option("-t, --template <template>", "template: minimal | project", "project")
    .action((name: string, opts: { template: string }) => {
      const templateDir = join(deps.templatesDir, opts.template)
      const created = scaffold(templateDir, name, { name })
      log(`✓ created ${name}/ (${created.length} files) from "${opts.template}"`)
    })

  return program
}
