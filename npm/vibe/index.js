#!/usr/bin/env node
// Thin launcher: exec the prebuilt platform binary (the @biomejs/biome model).
const { spawnSync } = require("node:child_process")
const { platform, arch } = process
const ext = platform === "win32" ? ".exe" : ""
const pkg = `@vibe/cli-${platform}-${arch}`
let bin
try {
  bin = require.resolve(`${pkg}/vibe${ext}`)
} catch {
  process.exit(1)
}
const res = spawnSync(bin, process.argv.slice(2), { stdio: "inherit" })
process.exit(res.status ?? 1)
