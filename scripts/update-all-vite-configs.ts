#!/usr/bin/env bun

import { existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

const packagesDir = resolve(__dirname, "packages")

function updateViteConfig(packageDir: string) {
  const viteConfigPath = resolve(packageDir, "vite.config.ts")

  if (!existsSync(viteConfigPath)) {
    return
  }

  // Calculate the relative path from the package to the tools directory
  const relativeToTools = "./../../tools/vite-utils" // From package/ to ../../tools/vite-utils

  const newContent = `import { defineConfig } from "vite"
import { createBaseViteConfig } from "${relativeToTools}"

// Library build: emits ESM + CJS into dist/ via Vite.
// .d.ts files are emitted separately by \`tsc --emitDeclarationOnly\` (see the build script).
// Each entry keeps its basename (index, cli, agent, …).
export default defineConfig(createBaseViteConfig("src/index.ts"))
`

  Bun.write(viteConfigPath, newContent)
  console.log(`Updated ${packageDir}`)
}

// Get all package directories
const packageDirs = (await readdirSync(packagesDir))
  .filter(
    (name) =>
      !name.startsWith(".") &&
      name !== "node_modules" &&
      existsSync(resolve(packagesDir, name, "package.json")),
  )
  .map((name) => resolve(packagesDir, name))

console.log(`Found ${packageDirs.length} packages to update`)

// Update each one
for (const packageDir of packageDirs) {
  updateViteConfig(packageDir)
}

console.log("Done!")
