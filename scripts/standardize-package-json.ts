import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const packagesDir = join(root, "packages")
const canonicalScriptsPath = join(__dirname, "package-scripts.json")

interface CanonicalScripts {
  library: Record<string, string>
}

interface PackageJson {
  name: string
  version?: string
  private?: boolean
  type?: string
  description?: string
  bin?: Record<string, string>
  exports?: Record<string, unknown>
  main?: string
  module?: string
  types?: string
  files?: string[]
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  tsd?: Record<string, unknown>
  peerDependencies?: Record<string, string>
  engines?: Record<string, string>
}

const canonicalScripts: CanonicalScripts = JSON.parse(readFileSync(canonicalScriptsPath, "utf-8"))

const canonicalFieldOrder = [
  "name",
  "version",
  "private",
  "type",
  "description",
  "bin",
  "exports",
  "main",
  "module",
  "types",
  "files",
  "scripts",
  "dependencies",
  "devDependencies",
  "tsd",
  "peerDependencies",
  "engines",
]

const packageDirs = readdirSync(packagesDir).filter((name) => {
  const pkgPath = join(packagesDir, name, "package.json")
  try {
    readFileSync(pkgPath, "utf-8")
    return true
  } catch {
    return false
  }
})

let fixed = 0
let skipped = 0

for (const name of packageDirs) {
  const pkgPath = join(packagesDir, name, "package.json")
  try {
    const content = readFileSync(pkgPath, "utf-8")
    const pkg = JSON.parse(content) as PackageJson

    let _changed = false

    if (!pkg.private) {
      pkg.private = true
      _changed = true
    }

    const canonicalScriptsForType = canonicalScripts.library
    if (pkg.scripts && canonicalScriptsForType) {
      for (const [scriptName, scriptValue] of Object.entries(canonicalScriptsForType)) {
        if (pkg.scripts[scriptName] !== scriptValue) {
          console.log(`  [scripts] ${name}: ${scriptName} differs`)
          console.log(`    expected: ${scriptValue}`)
          console.log(`    actual:   ${pkg.scripts[scriptName] || "<missing>"}`)
        }
      }
    }

    const sorted: Record<string, unknown> = {}
    for (const key of canonicalFieldOrder) {
      if (key in pkg) {
        sorted[key] = (pkg as Record<string, unknown>)[key]
      }
    }
    for (const key of Object.keys(pkg)) {
      if (!(key in sorted)) {
        sorted[key] = (pkg as Record<string, unknown>)[key]
      }
    }

    const newContent = `${JSON.stringify(sorted, null, 2)}\n`
    if (newContent !== content) {
      writeFileSync(pkgPath, newContent)
      fixed++
      console.log(`  [fixed] ${name}/package.json`)
    } else {
      skipped++
    }
  } catch (error) {
    console.error(`  [error] ${name}:`, error)
    skipped++
  }
}

console.log(`\nSummary: ${fixed} fixed, ${skipped} skipped, ${packageDirs.length} total`)
