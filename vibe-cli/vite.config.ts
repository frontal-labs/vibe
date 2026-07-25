import { existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig } from "vite"
import { createBaseViteConfig } from "../packages/vite-config/vite.config"

// The `vibe/*` workspace packages live in `packages/`, `tools/`, or at the repo root
// (the umbrella `@frontal-labs/vibe` package now lives at `./vibe`, and
// `vibe/generators` lives in `tools/generators`).
const vibePackageDirs = [
  resolve(__dirname, "..", "packages"),
  resolve(__dirname, "..", "tools"),
  resolve(__dirname, ".."),
]
const vibeAliases = Object.fromEntries(
  vibePackageDirs
    .flatMap((dir) => (existsSync(dir) ? readdirSync(dir).map((name) => [dir, name]) : []))
    .filter(
      ([dir, name]) => name !== "node_modules" && existsSync(resolve(dir, name, "src", "index.ts")),
    )
    .flatMap(([dir, name]) => {
      const src = resolve(dir, name, "src")
      return [
        [`vibe/${name}`, src],
        [`vibe/${name}/*`, resolve(src, "*")],
      ]
    }),
)

// Externalize workspace + third-party deps (third-party deps are externalized by default).
const _external = (id) =>
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
  ["vibe/generators", "chokidar", "commander", "vibe/build", "vibe/errors"].some(
    (d) => id === d || id.startsWith(`${d}/`),
  )

// Library build: emits ESM + CJS into dist/ via Vite.
// .d.ts files are emitted separately by `tsc --emitDeclarationOnly` (see the build script).
// Each entry keeps its basename (index, cli, agent, …).
export default defineConfig({
  ...createBaseViteConfig(),
  resolve: {
    alias: vibeAliases,
  },
  build: {
    ...createBaseViteConfig().build,
    lib: {
      entry: {
        index: "src/index.ts",
        cli: "src/cli.ts",
      },
      formats: ["es", "cjs"],
    },
  },
})
