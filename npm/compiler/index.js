// @vibe/compiler — loads the platform napi addon and returns parsed results.
const { platform, arch } = process
const pkg = `@vibe/compiler-${platform}-${arch}`
let addon
try {
  addon = require(pkg)
} catch {
  throw new Error(`@vibe/compiler: no prebuilt addon for ${platform}-${arch} (missing ${pkg}).`)
}

/** Compile .vibe source → { typescript, declarations, sourceMap, hasErrors, diagnostics }. */
exports.compile = (src) => JSON.parse(addon.compile(src))
/** Type-check .vibe source → { errorCount, warningCount, diagnostics }. */
exports.check = (src) => JSON.parse(addon.check(src))
/** Compiler version string. */
exports.version = () => addon.version()
