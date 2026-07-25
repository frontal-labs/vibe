import { copyFileSync, existsSync } from "node:fs"
import { platform } from "node:os"
import { resolve } from "node:path"

const os = platform()
const ext = os === "win32" ? "dll" : os === "darwin" ? "dylib" : "so"
const releaseDir = resolve("target/release")
const libName = `libvibe_napi.${ext}`
const libPath = `${releaseDir}/${libName}`
const nodePath = `${releaseDir}/vibe_napi.node`

if (!existsSync(libPath)) {
  console.error(`NAPI library not found: ${libPath}`)
  process.exit(1)
}

copyFileSync(libPath, nodePath)
console.log(`Copied ${libName} → vibe_napi.node`)
