#!/bin/bash

echo "Updating all vite.config.ts files to use shared config..."

# Find all vite.config.ts files in packages/
find packages -name "vite.config.ts" -type f | while read -r file; do
    echo "Updating $file"
    cat > "$file" << 'EOF'
import { defineConfig } from "vite"
import { createBaseViteConfig } from "../../tools/vite-utils"

// Library build: emits ESM + CJS into dist/ via Vite.
// .d.ts files are emitted separately by `tsc --emitDeclarationOnly` (see the build script).
// Each entry keeps its basename (index, cli, agent, …).
export default defineConfig(createBaseViteConfig("src/index.ts"))
EOF
done

# Update vibe/vite.config.ts
echo "Updating vibe/vite.config.ts"
cat > "vibe/vite.config.ts" << 'EOF'
import { defineConfig } from "vite"
import { createBaseViteConfig } from "../packages/vite-config/vite.config"

// Library build: emits ESM + CJS into dist/ via Vite.
// .d.ts files are emitted separately by `tsc --emitDeclarationOnly` (see the build script).
// Entry points for the barrel package.
export default defineConfig({
  ...createBaseViteConfig(),
  build: {
    ...createBaseViteConfig().build,
    lib: {
      entry: {
        index: "src/index.ts",
        agent: "src/agent.ts",
        tools: "src/tools.ts",
        model: "src/model.ts",
        memory: "src/memory.ts",
        core: "src/core.ts",
        errors: "src/errors.ts",
        logger: "src/logger.ts",
        runtime: "src/runtime.ts",
        plugin: "src/plugin.ts",
        di: "src/di.ts",
        adapters: "src/adapters.ts",
        tracing: "src/tracing.ts",
        evals: "src/evals.ts",
        deploy: "src/deploy.ts",
        devtools: "src/devtools.ts",
        config: "src/config.ts",
        skills: "src/skills.ts",
        workflows: "src/workflows.ts",
        ontology: "src/ontology.ts",
        governance: "src/governance.ts",
        security: "src/security.ts",
        observability: "src/observability.ts",
      },
      formats: ["es", "cjs"],
    },
  },
})
EOF

# Update npm/vibe-cli/vite.config.ts
echo "Updating npm/vibe-cli/vite.config.ts"
cat > "npm/vibe-cli/vite.config.ts" << 'EOF'
import { defineConfig } from "vite"
import { createBaseViteConfig } from "../packages/vite-config/vite.config"
import { existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

// The `vibe/*` workspace packages live in `packages/`, `tools/`, or at the repo root
// (the umbrella `@frontal-labs/vibe` package now lives at `./vibe`, and
// `vibe/generators` lives in `tools/generators`).
const vibePackageDirs = [
  resolve(__dirname, "..", "packages"),
  resolve(__dirname, "..", "tools"),
  resolve(__dirname, ".."),
]
const vibeAliases = Object.fromEntries(
  vibePackageDirs
    .flatMap((dir) => (existsSync(dir) ? readdirSync(dir).map((name) => [dir, name]) : []))
    .filter(
      ([dir, name]) => name !== "node_modules" && existsSync(resolve(dir, name, "src", "index.ts")),
    )
    .flatMap(([dir, name]) => {
      const src = resolve(dir, name, "src")
      return [
        [`vibe/${name}`, src],
        [`vibe/${name}/*`, resolve(src, "*")],
      ]
    }),
)

// Externalize workspace + third-party deps (third-party deps are externalized by default).
const external = (id) =>
  id.startsWith("node:") ||
  [
    [
      "util",
      "path",
      "fs",
      "os",
      "crypto",
      "events",
      "stream",
      "url",
      "http",
      "https",
      "child_process",
    ],
  ].some((b) => id === b || id.startsWith(`${b}/`)) ||
  ["vibe/generators", "chokidar", "commander", "vibe/build", "vibe/errors"].some(
    (d) => id === d || id.startsWith(`${d}/`),
  )

// Library build: emits ESM + CJS into dist/ via Vite.
// .d.ts files are emitted separately by `tsc --emitDeclarationOnly` (see the build script).
// Each entry keeps its basename (index, cli, agent, …).
export default defineConfig({
  ...createBaseViteConfig(),
  resolve: {
    alias: vibeAliases,
  },
  build: {
    ...createBaseViteConfig().build,
    lib: {
      entry: {
        index: "src/index.ts",
        cli: "src/cli.ts",
      },
      formats: ["es", "cjs"],
    },
  },
})
EOF

# Update tools/generators/vite.config.ts
echo "Updating tools/generators/vite.config.ts"
cat > "tools/generators/vite.config.ts" << 'EOF'
import { defineConfig } from "vite"
import { createBaseViteConfig } from "../../../tools/vite-utils"

// Library build: emits ESM + CJS into dist/ via Vite.
// .d.ts files are emitted separately by `tsc --emitDeclarationOnly` (see the build script).
// Each entry keeps its basename (index, cli, agent, …).
export default defineConfig(createBaseViteConfig("src/index.ts"))
EOF

echo "Done!"