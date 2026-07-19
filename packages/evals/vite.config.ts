import { existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig } from "vite"

const packagesDir = resolve(__dirname, "..")
const vibeAliases = Object.fromEntries(
  readdirSync(packagesDir)
    .filter(
      (name) =>
        name !== "node_modules" && existsSync(resolve(packagesDir, name, "src", "index.ts")),
    )
    .flatMap((name) => {
      const src = resolve(packagesDir, name, "src")
      return [
        [`vibe/${name}`, src],
        [`vibe/${name}/*`, resolve(src, "*")],
      ]
    }),
)

// Externalize workspace + third-party deps (third-party deps are externalized by default).
const external = (id) =>
  id.startsWith("node:") ||
  [
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
    ],
  ].some((b) => id === b || id.startsWith(`${b}/`)) ||
  ["vibe/shared"].some((d) => id === d || id.startsWith(`${d}/`))

// Library build: emits ESM + CJS into dist/ via Vite.
// .d.ts files are emitted separately by `tsc --emitDeclarationOnly` (see the build script).
// Each entry keeps its basename (index, cli, agent, …).
export default defineConfig({
  resolve: {
    alias: vibeAliases,
  },
  build: {
    target: "node20",
    lib: {
      entry: {
        index: "src/index.ts",
      },
      formats: ["es", "cjs"],
    },
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      external,
      output: {
        entryFileNames: (chunk, format) => `${chunk.name}.${format === "es" ? "js" : "cjs"}`,
        chunkFileNames: "chunk-[name].[format].js",
        exports: "named",
      },
    },
  },
})
