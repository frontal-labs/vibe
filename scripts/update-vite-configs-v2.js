import { existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

const __dirname = new URL(import.meta.url).pathname.endsWith(".js")
  ? new URL(import.meta.url).pathname
  : new URL(`${import.meta.url}.js`).pathname

const packagesDir = resolve(dirname, "..", "packages")

function dirname(path) {
  return path.substring(0, path.lastIndexOf("/"))
}

function updateViteConfig(packageName) {
  const packageDir = resolve(packagesDir, packageName)
  const viteConfigPath = resolve(packageDir, "vite.config.ts")

  if (!existsSync(viteConfigPath)) {
    console.log(`Skipping ${packageName} - no vite.config.ts found`)
    return
  }

  // Calculate relative path from package to tools/vite-utils.ts
  // From packages/{packageName}/ to ../../tools/vite-utils.ts
  const relativePath = "../../tools/vite-utils"

  const newContent = `import { defineConfig } from "vite"
import { createBaseViteConfig } from "${relativePath}"

// Library build: emits ESM + CJS into dist/ via Vite.
// .d.ts files are emitted separately by \`tsc --emitDeclarationOnly\` (see the build script).
// Each entry keeps its basename (index, cli, agent, …).
export default defineConfig(createBaseViteConfig("src/index.ts"))
`

  require("node:fs").writeFileSync(viteConfigPath, newContent, "utf8")
  console.log(`Updated ${packageName}'s vite.config.ts`)
}

// Get all package directories
const packageDirs = readdirSync(packagesDir).filter(
  (name) =>
    existsSync(resolve(packagesDir, name, "package.json")) &&
    !name.startsWith(".") &&
    name !== "node_modules",
)

// Filter to only those with vite.config.ts
const packagesWithViteConfig = packageDirs.filter((name) =>
  existsSync(resolve(packagesDir, name, "vite.config.ts")),
)

console.log(`Found ${packagesWithViteConfig.length} packages with vite.config.ts to update`)

// Update each one
for (const packageName of packageDirs) {
  updateViteConfig(packageName)
}

console.log("Done!")
