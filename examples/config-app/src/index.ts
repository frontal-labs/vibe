import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { discoverApp, toolEdges } from "@vibe/build"

import support from "../agents/support"

// The app root is the directory above `src/`.
const root = fileURLToPath(new URL("..", import.meta.url))

// 1. Convention-based discovery: resolve `vibe.config.*`, `agents/*`, `tools/*`,
//    `skills/*`, and `workflows/*` into the build graph `@vibe/build` consumes.
const app = await discoverApp(root)
console.log(`app:    ${app.config?.name ?? "(no config)"}`)
console.log(`agents: ${app.agents.map((a) => a.name).join(", ") || "—"}`)
console.log(`tools:  ${app.tools.map((t) => t.name).join(", ") || "—"}`)

// 2. The code-split graph: which tools each agent imports. `vibe build` turns each
//    of these edges into its own lazily-loaded chunk for minimal cold starts.
console.log("\ncode-split graph:")
for (const agent of app.agents) {
  const edges = toolEdges(readFileSync(agent.file, "utf8"))
  console.log(`  ${agent.name} → [${edges.map((e) => e.local).join(", ") || "no tools"}]`)
}

// 3. Discovered agents are ordinary runnable modules. Run one end-to-end:
console.log("\nrun:", (await support.run("Where is order 1001?")).text)
