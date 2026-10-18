// Bundles TypeScript declarations for a published package. Run from the package
// directory: `node ../tools/bundle-dts.mjs <entry.ts>...`. Each entry produces
// dist/<basename>.d.ts with the types of every `vibe/*` workspace package inlined,
// so the published .d.ts files do not import packages that are not on npm.
import { mkdirSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { basename, resolve } from "node:path"

// Keep in sync with `externalizeThirdParty` in tools/vite-utils.ts.
const THIRD_PARTY = [
  "zod",
  "@standard-schema/spec",
  "@anthropic-ai/sdk",
  "@modelcontextprotocol/sdk",
  "esbuild",
  "handlebars",
  "chokidar",
  "commander",
]

const require = createRequire(resolve(process.cwd(), "package.json"))
const { generateDtsBundle } = require("dts-bundle-generator")

const entries = process.argv.slice(2)
if (entries.length === 0) {
  console.error("usage: node ../tools/bundle-dts.mjs <entry.ts>...")
  process.exit(1)
}

const bundles = generateDtsBundle(
  entries.map((filePath) => ({
    filePath,
    output: { sortNodes: true, noBanner: false },
    // Third-party deps stay as imports; they are declared dependencies of the package.
    libraries: { importedLibraries: THIRD_PARTY },
  })),
  { preferredConfigPath: resolve(process.cwd(), "tsconfig.dts.json") },
)

mkdirSync("dist", { recursive: true })
entries.forEach((filePath, i) => {
  const out = resolve("dist", `${basename(filePath, ".ts")}.d.ts`)
  writeFileSync(out, bundles[i])
  console.log(`wrote ${out}`)
})
