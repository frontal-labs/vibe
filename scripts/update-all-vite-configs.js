#!/usr/bin/env bun

import { existsSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const packagesDir = "./packages"
const utilsPath = "../tools/vite-utils"

function updateViteConfig(packageDir) {
  const viteConfigPath = join(packageDir, "vite.config.ts")
  
  if (!existsSync(viteConfigPath)) {
    return
  }
  
  const newContent = `import { defineConfig } from "vite"
import { createBaseViteConfig } from "${utilsPath}"

// Library build: emits ESM + CJS into dist/ via Vite.
// .d.ts files are emitted separately by \`tsc --emitDeclarationOnly\` (see the build script).
// Each entry keeps its basename (index, cli, agent, …).
export default defineConfig(createBaseViteConfig("src/index.ts"))
`

  writeFileSync(viteConfigPath, newContent)
  console.log(\`Updated \${packageDir}\`)
}

// Get all package directories
const packageDirs = readdirSync("./packages")
  .filter(name => 
    !name.startsWith('.') && 
    name !== "node_modules" &&
    existsSync(join("./packages", name, "package.json"))
  )
  .map(name => join("./packages", name))

console.log(\`Found \${packageDirs.length} packages to update\`)

// Update each one
for (const packageDir of packageDirs) {
  updateViteConfig(packageDir)
}

console.log("Done!")
