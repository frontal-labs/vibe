import { existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig, type UserConfig } from "vite"

function vibeAliases(dir: string): Record<string, string> {
  const base = resolve(__dirname, "..", "..", dir)
  if (!existsSync(base)) return {}
  return Object.fromEntries(
    readdirSync(base)
      .filter((name) => existsSync(resolve(base, name, "src", "index.ts")))
      .flatMap((name) => {
        const src = resolve(base, name, "src")
        return [
          [`vibe/${name}`, src],
          [`vibe/${name}/*`, resolve(src, "*")],
        ]
      }),
  )
}

const aliases = {
  ...vibeAliases("packages"),
  ...vibeAliases("tools/generators"),
}

// Externalize workspace + third-party deps (third-party deps are externalized by default).
const external = (id: string) =>
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
    "vibe/agent",
    "vibe/build",
    "vibe/config",
    "vibe/core",
    "vibe/deploy",
    "vibe/devtools",
    "vibe/di",
    "vibe/errors",
    "vibe/evals",
    "vibe/governance",
    "vibe/lifecycle",
    "vibe/logger",
    "vibe/mcp-server",
    "vibe/memory",
    "vibe/model",
    "vibe/observability",
    "vibe/ontology",
    "vibe/plugin",
    "vibe/runtime",
    "vibe/security",
    "vibe/shared",
    "vibe/skills",
    "vibe/tools",
    "vibe/tracing",
    "vibe/workflows",
    "zod",
    "@standard-schema/spec",
    "@anthropic-ai/sdk",
    "esbuild",
    "handlebars",
    "chokidar",
    "commander",
  ].some((d) => id === d || id.startsWith(`${d}/`))

/**
 * Base Vite configuration for all vibe packages
 * @param entry - Entry point for the library (default: "src/index.ts")
 */
export function createBaseConfig(entry: string = "src/index.ts"): UserConfig {
  return defineConfig({
    resolve: {
      alias: aliases,
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
        external,
        // Rollup passes only the chunk to entryFileNames, so `format` is undefined in real builds
        // and every entry gets `.cjs`. The contract below is what tests/vite-config.test.ts asserts.
        output: {
          entryFileNames: ((chunk: { name: string }, format: string) =>
            `${chunk.name}.${format === "es" ? "js" : "cjs"}`) as unknown as string,
          chunkFileNames: "chunk-[name].[format].js",
          exports: "named",
        },
      },
    },
  })
}
