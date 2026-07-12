import { defineConfig } from "tsup"

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/agent.ts",
    "src/tools.ts",
    "src/model.ts",
    "src/memory.ts",
    "src/core.ts",
    "src/errors.ts",
    "src/logger.ts",
    "src/runtime.ts",
    "src/plugin.ts",
    "src/di.ts",
    "src/adapters.ts",
    "src/tracing.ts",
    "src/evals.ts",
    "src/deploy.ts",
    "src/devtools.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
})
