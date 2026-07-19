import { existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { defineWorkspace } from "vitest/config"

const packagesDir = resolve(__dirname, "packages")

const packageNames = readdirSync(packagesDir)
  .filter((name) => existsSync(resolve(packagesDir, name, "src", "index.ts")))
  .map((name) => name)

const vibeAliases = Object.fromEntries(
  packageNames.flatMap((name) => {
    const src = resolve(packagesDir, name, "src")
    return [
      [`vibe/${name}`, src],
      [`vibe/${name}/*`, resolve(src, "*")],
    ]
  }),
)

const zodPath = resolve(__dirname, "node_modules/.bun/zod@4.4.3/node_modules/zod")

export default defineWorkspace([
  "packages/adapters",
  "packages/agent",
  "packages/cli",
  "packages/build",
  "packages/config",
  "packages/core",
  "packages/deploy",
  "packages/devtools",
  "packages/di",
  "packages/errors",
  "packages/evals",
  "packages/lifecycle",
  "packages/logger",
  "packages/memory",
  "packages/mcp-server",
  "packages/model",
  "packages/plugin",
  "packages/runtime",
  "packages/shared",
  "packages/tools",
  "packages/tracing",
  "packages/typescript-config",
  "packages/skills",
  "packages/workflows",
  "packages/ontology",
  "packages/governance",
  "packages/security",
  "packages/observability",
  "tools/generators",
  {
    test: {
      name: "tests",
      root: __dirname,
      include: ["tests/**/*.test.ts"],
      exclude: ["node_modules", "**/node_modules", "packages/*/dist", "**/.turbo"],
      globals: true,
      environment: "node",
      setupFiles: [resolve(__dirname, "tests/setup.ts")],
      testTimeout: 20_000,
      hookTimeout: 10_000,
    },
    resolve: {
      alias: {
        ...vibeAliases,
        zod: zodPath,
      },
    },
  },
])
