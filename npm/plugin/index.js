// esbuild-compatible plugin (works in tsup/Vite): compile `.vibe` → TypeScript.
const fs = require("node:fs/promises")
const { compile } = require("@vibe/compiler")

module.exports = function vibePlugin() {
  return {
    name: "vibe",
    setup(build) {
      build.onLoad({ filter: /\.vibe$/ }, async (args) => {
        const src = await fs.readFile(args.path, "utf8")
        const out = compile(src)
        const errors = out.diagnostics
          .filter((d) => d.severity === "error")
          .map((d) => ({
            text: `${d.code}: ${d.message}`,
            location: { file: args.path, line: d.line, column: d.col - 1 },
          }))
        if (errors.length) return { errors }
        return { contents: out.typescript, loader: "ts" }
      })
    },
  }
}
