#!/usr/bin/env node
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// The CLI bundle is CommonJS (`cli.cjs`). This package is `"type": "module"`, so a `.js` bundle
// would be loaded as ESM and `require` would not exist; the `.cjs` name is what makes it load.
const binDir = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

try {
  require(resolve(binDir, "..", "dist", "cli.cjs"))
} catch (error) {
  console.error(error)
  process.exit(1)
}
