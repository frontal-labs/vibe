// Usage (from a package dir): node ../tools/bundle-dts.mjs <entry.ts>...
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
  "vite",
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
