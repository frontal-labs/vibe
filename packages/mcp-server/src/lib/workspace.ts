import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

export interface PackageInfo {
  readonly name: string
  readonly vibeDependencies: string[]
}

/** Scan `packages/*` and return each package's `@vibe/*` dependencies (the acyclic graph). */
export function listPackages(repoRoot: string): PackageInfo[] {
  const dir = join(repoRoot, "packages")
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => existsSync(join(dir, name, "package.json")))
    .map((name) => {
      const pkg = JSON.parse(readFileSync(join(dir, name, "package.json"), "utf8")) as {
        name?: string
        dependencies?: Record<string, string>
      }
      const deps = Object.keys(pkg.dependencies ?? {}).filter((d) => d.startsWith("@vibe/"))
      return { name: pkg.name ?? name, vibeDependencies: deps }
    })
}
