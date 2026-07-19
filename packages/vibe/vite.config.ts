import { defineConfig } from "vite"

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
  [
    "vibe/agent",
    "vibe/tools",
    "vibe/model",
    "vibe/memory",
    "vibe/core",
    "vibe/errors",
    "vibe/logger",
    "vibe/runtime",
    "vibe/plugin",
    "vibe/di",
    "vibe/adapters",
    "vibe/tracing",
    "vibe/evals",
    "vibe/deploy",
    "vibe/devtools",
    "vibe/config",
    "vibe/skills",
    "vibe/workflows",
    "vibe/ontology",
    "vibe/governance",
    "vibe/security",
    "vibe/observability",
  ].some((d) => id === d || id.startsWith(`${d}/`))

// Library build: emits ESM + CJS into dist/ via Vite.
// .d.ts files are emitted separately by `tsc --emitDeclarationOnly` (see the build script).
// Each entry keeps its basename (index, cli, agent, …).
export default defineConfig({
  build: {
    target: "node20",
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
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      external,
      output: {
        entryFileNames: (chunk, format) => `${chunk.name}.${format === "es" ? "js" : "cjs"}`,
        chunkFileNames: "chunk-[name].[format].js",
        exports: "named",
      },
    },
  },
})
