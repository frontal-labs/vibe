import { defineConfig } from "vite"
import { createBaseViteConfig, externalizeThirdParty } from "../tools/vite-utils"

// Library build: emits ESM + CJS into dist/ via Vite.
// .d.ts files are bundled by tools/bundle-dts.mjs (see the build script).
// Entry points for the barrel package.
export default defineConfig({
  ...createBaseViteConfig(),
  build: {
    ...createBaseViteConfig().build,
    // Bundle vibe/* workspace code; keep third-party deps as declared dependencies.
    rollupOptions: {
      ...createBaseViteConfig().build?.rollupOptions,
      external: externalizeThirdParty,
    },
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
