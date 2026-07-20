#!/usr/bin/env node
import { createRequire } from "node:module"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const binDir = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const esmEntry = resolve(binDir, "..", "dist", "cli.js")
const cjsEntry = resolve(binDir, "..", "dist", "cli.cjs")
const cliEntry = existsSync(esmEntry) ? esmEntry : cjsEntry

try {
  require(cliEntry)
} catch (error) {
  console.error(error)
  process.exit(1)
}
