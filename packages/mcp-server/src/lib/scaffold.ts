import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { configError } from "@vibe/errors"

import { resolveWithin } from "./path"

const packageJson = (scoped: string) =>
  `${JSON.stringify(
    {
      name: scoped,
      version: "0.0.0",
      type: "module",
      exports: {
        ".": {
          import: "./dist/index.js",
          require: "./dist/index.cjs",
          types: "./dist/index.d.ts",
        },
      },
      main: "./dist/index.cjs",
      module: "./dist/index.js",
      types: "./dist/index.d.ts",
      files: ["dist"],
      scripts: {
        build: "tsup",
        dev: "tsup --watch",
        test: "vitest run",
        "test:types": "tsd",
        typecheck: "tsc --noEmit",
        clean: "rm -rf dist",
      },
      dependencies: {},
      devDependencies: {
        tsd: "^0.31.2",
        tsup: "^8.3.5",
        vitest: "^2.1.8",
      },
      tsd: { directory: "type-tests" },
      description: "",
    },
    null,
    2,
  )}\n`

const tsconfig = `${JSON.stringify(
  {
    extends: "../../packages/typescript-config/tsconfig.library.json",
    compilerOptions: { rootDir: "./src" },
    include: ["src"],
  },
  null,
  2,
)}\n`

const tsup = `import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
})
`

const indexTs = (scoped: string) => `export const name = "${scoped}"\n`

/**
 * Generate a new `@vibe/*` package following the repo's conventions, so an agent
 * can extend Vibe without hand-wiring tsconfig/tsup/exports. Returns the created
 * file paths. Refuses names that already exist or contain path separators.
 */
export function scaffoldPackage(repoRoot: string, name: string): string[] {
  if (name.includes("/") || name.includes("\\") || name.trim() === "") {
    throw configError(`Invalid package name: "${name}". Use a bare name, e.g. "cache".`)
  }
  const scoped = name.startsWith("@vibe/") ? name : `@vibe/${name}`
  const dir = resolveWithin(repoRoot, join("packages", name))

  if (existsSync(dir)) {
    throw configError(`Package directory already exists: ${dir}`)
  }

  const files: Record<string, string> = {
    "package.json": packageJson(scoped),
    "tsconfig.json": tsconfig,
    "tsup.config.ts": tsup,
    "src/index.ts": indexTs(scoped),
    "type-tests/.gitkeep": "",
  }

  const created: string[] = []
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
    created.push(full)
  }
  return created
}

const agentTs = (name: string) => `import { defineTool } from "@vibe/tools"
import { createAgent } from "@vibe/agent"
import type { ModelProvider } from "@vibe/model"
import { z } from "zod"

// A self-contained agent scaffold. Wire a real provider (e.g. createAnthropicProvider)
// and register this module's tools on a System to run it. Replace the tool body below
// with your own data source (DB query, HTTP call, ontology retrieve, …).
const knowledge: Record<string, string> = {
  hello: "Hi! Ask me anything and I'll look it up.",
}

export const ${camel(name)}Tool = defineTool({
  name: "${snake(name)}_lookup",
  description: "Look up information for the ${name} agent.",
  schema: z.object({
    query: z.string().describe("What to look up."),
  }),
  execute({ query }) {
    const key = query.trim().toLowerCase()
    const answer = knowledge[key]
    return Promise.resolve(
      answer ?? \`No entry for "\${query}". Known keys: \${Object.keys(knowledge).join(", ")}.\`,
    )
  },
})

export function create${pascal(name)}Agent(provider: ModelProvider) {
  return createAgent({
    provider,
    system: "You are the ${name} agent. Use your tools before guessing.",
    tools: [${camel(name)}Tool],
  })
}
`

/**
 * Generate a runnable agent example module under `examples/`. Vibe apps are plain
 * TypeScript that run on the `@vibe/*` runtime; this emits a ready-to-run starter.
 * Returns the created file path.
 */
export function scaffoldAgent(repoRoot: string, name: string): string[] {
  if (name.includes("/") || name.includes("\\") || name.trim() === "") {
    throw configError(`Invalid agent name: "${name}". Use a bare name, e.g. "triage".`)
  }
  const dir = resolveWithin(repoRoot, join("examples", name))
  const full = join(dir, "agent.ts")
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, agentTs(name))
  return [full]
}

function camel(name: string): string {
  const c = name.replace(/[_-\s]+(.)/g, (_, c: string) => c.toUpperCase())
  return c.charAt(0).toLowerCase() + c.slice(1)
}

function pascal(name: string): string {
  const c = camel(name)
  return c.charAt(0).toUpperCase() + c.slice(1)
}

function snake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase()
}
