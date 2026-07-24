const { existsSync, readdirSync, readFileSync, writeFileSync } = require("node:fs")
const { resolve } = require("node:path")

const packagesDir = resolve(__dirname, "..", "packages")

function updateViteConfig(packageName) {
  const packageDir = resolve(packagesDir, packageName)
  const viteConfigPath = resolve(packageDir, "vite.config.ts")

  if (!existsSync(viteConfigPath)) {
    console.log(`Skipping ${packageName} - no vite.config.ts found`)
    return
  }

  // Read package.json to get the name for the import path
  const packageJsonPath = resolve(packageDir, "package.json")
  if (!existsSync(packageJsonPath)) {
    console.log(`Skipping ${packageName} - no package.json found`)
    return
  }

  const _packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))

  // Calculate relative path from this package to the vite-config package
  // We need to go from packages/{packageName}/ to packages/vite-config/
  const relativePath = "../vite-config/vite.config"

  const newContent = `import { createBaseConfig } from "${relativePath}";

// Library build: emits ESM + CJS into dist/ via Vite.
// .d.ts files are emitted separately by \`tsc --emitDeclarationOnly\` (see the build script).
// Each entry keeps its basename (index, cli, agent, …).
export default createBaseConfig("src/index.ts")
`

  writeFileSync(viteConfigPath, newContent, "utf8")
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
for (const packageName of packagesWithViteConfig) {
  updateViteConfig(packageName)
}

console.log("Done!")
