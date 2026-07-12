import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

const pkg = (name: string) => resolve(__dirname, "..", "packages", name, "src")

export default defineConfig({
  test: {
    include: ["integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@vibe/adapters": pkg("adapters"),
      "@vibe/agent": pkg("agent"),
      "@vibe/core": pkg("core"),
      "@vibe/deploy": pkg("deploy"),
      "@vibe/devtools": pkg("devtools"),
      "@vibe/di": pkg("di"),
      "@vibe/errors": pkg("errors"),
      "@vibe/evals": pkg("evals"),
      "@vibe/lifecycle": pkg("lifecycle"),
      "@vibe/logger": pkg("logger"),
      "@vibe/memory": pkg("memory"),
      "@vibe/model": pkg("model"),
      "@vibe/plugin": pkg("plugin"),
      "@vibe/runtime": pkg("runtime"),
      "@vibe/shared": pkg("shared"),
      "@vibe/tools": pkg("tools"),
      "@vibe/tracing": pkg("tracing"),
    },
  },
})
