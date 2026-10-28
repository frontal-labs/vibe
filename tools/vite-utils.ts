import { existsSync, readdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { UserConfig } from "vite"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Generate aliases for all @vibe/* packages
 * @returns Record of alias mappings
 */
export function generateVibeAliases(): Record<string, string> {
  const _packagesDir = resolve(__dirname, "..", "packages")
  const _generatorsDir = resolve(__dirname, "..", "..", "tools", "generators")

  function vibeAliases(dir: string): Record<string, string> {
    const base = resolve(__dirname, "..", dir)
    if (!existsSync(base)) return {}
    return Object.fromEntries(
      readdirSync(base)
        .filter((name) => existsSync(resolve(base, name, "src", "index.ts")))
        .flatMap((name) => {
          const src = resolve(base, name, "src")
          return [
            [`@vibe/${name}`, src],
            [`@vibe/${name}/*`, resolve(src, "*")],
          ]
        }),
    )
  }

  // tools/generators is itself a package (not a parent of packages), so alias it directly.
  const generatorsSrc = resolve(__dirname, "..", "tools", "generators", "src")

  return {
    ...vibeAliases("packages"),
    "@@vibe/generators": generatorsSrc,
    "@@vibe/generators/*": resolve(generatorsSrc, "*"),
    ...vibeAliases("tools/generators"),
  }
}

/**
 * Check if an ID should be externalized (node built-ins or third-party deps)
 * @param id - Module identifier to check
 * @returns True if the module should be externalized
 */
export function externalize(id: string): boolean {
  return (
    id.startsWith("node:") ||
    [
      "util",
      "path",
      "fs",
      "os",
      "crypto",
      "events",
      "stream",
      "url",
      "http",
      "https",
      "child_process",
    ].some((b) => id === b || id.startsWith(`${b}/`)) ||
    [
      "@@vibe/agent",
      "@@vibe/build",
      "@@vibe/config",
      "@@vibe/core",
      "@@vibe/deploy",
      "@@vibe/devtools",
      "@@vibe/di",
      "@@vibe/errors",
      "@@vibe/evals",
      "@@vibe/governance",
      "@@vibe/lifecycle",
      "@@vibe/logger",
      "@@vibe/mcp-server",
      "@@vibe/memory",
      "@@vibe/model",
      "@@vibe/observability",
      "@@vibe/ontology",
      "@@vibe/plugin",
      "@@vibe/runtime",
      "@@vibe/security",
      "@@vibe/shared",
      "@@vibe/skills",
      "@@vibe/tools",
      "@@vibe/tracing",
      "@@vibe/workflows",
      "zod",
      "@standard-schema/spec",
      "@anthropic-ai/sdk",
      "@modelcontextprotocol/sdk",
      "esbuild",
      "handlebars",
      "chokidar",
      "commander",
      "vite",
    ].some((d) => id === d || id.startsWith(`${d}/`))
  )
}

/** Externalize node built-ins and third-party deps; bundle `@vibe/*` workspace code. */
export function externalizeThirdParty(id: string): boolean {
  return !id.startsWith("@vibe/") && externalize(id)
}

/**
 * Create a base Vite configuration for all vibe packages
 * @param entry - Entry point for the library (default: "src/index.ts")
 * @returns Vite user configuration
 */
export function createBaseViteConfig(entry: string = "src/index.ts"): UserConfig {
  return {
    resolve: {
      alias: generateVibeAliases(),
    },
    build: {
      target: "node20",
      lib: {
        entry,
        formats: ["es", "cjs"],
      },
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: true,
      rollupOptions: {
        external: externalize,
        // One output per format. A shared `[name].js` name made the CJS build overwrite the ESM
        // build, and the package's `require` entries (`.cjs`) were never written.
        output: [
          {
            format: "es",
            entryFileNames: "[name].js",
            chunkFileNames: "chunk-[name].js",
            exports: "named",
          },
          {
            format: "cjs",
            entryFileNames: "[name].cjs",
            chunkFileNames: "chunk-[name].cjs",
            exports: "named",
          },
        ],
      },
    },
  }
}
