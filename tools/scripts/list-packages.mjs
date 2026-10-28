#!/usr/bin/env node
// Print the workspace package graph: each @vibe/* package and its @vibe/* deps.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const root = new URL("../..", import.meta.url).pathname
const dir = join(root, "packages")
for (const name of readdirSync(dir)) {
  const pkgPath = join(dir, name, "package.json")
  if (!existsSync(pkgPath)) continue
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
  const deps = Object.keys(pkg.dependencies ?? {}).filter((d) => d.startsWith("@vibe/"))
  console.log(`${pkg.name}\n  ${deps.length ? deps.join(", ") : "(no @vibe deps)"}`)
}
