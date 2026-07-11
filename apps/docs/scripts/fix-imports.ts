import { readFile, writeFile } from "node:fs/promises"

const files = [
  "/Users/gabrielfonseca/Downloads/vibe/packages/mcp-server/src/session.ts",
  "/Users/gabrielfonseca/Downloads/vibe/packages/mcp-server/src/tools/dev.ts",
  "/Users/gabrielfonseca/Downloads/vibe/packages/mcp-server/src/tools/engineer.ts",
]

for (const file of files) {
  let content = await readFile(file, "utf-8")
  content = content.replace(/\s*=\s*from\s+/g, " from ")
  await writeFile(file, content)
}
