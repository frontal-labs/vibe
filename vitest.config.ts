import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    root: __dirname,
    include: ["packages/*/src/**/*.test.ts", "packages/*/tests/**/*.test.ts"],
    exclude: ["node_modules", "packages/*/dist", "**/.turbo"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html", "json-summary"],
      include: ["packages/*/src/**"],
      exclude: ["**/*.test.ts", "**/*.test-d.ts", "**/*.d.ts", "**/types/**"],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 75,
        lines: 80,
      },
    },
    globals: true,
    environment: "node",
    testTimeout: 10_000,
    hookTimeout: 10_000,
    reporters: ["default", "verbose"],
  },
  resolve: {
    alias: {
      "@vibe/agent": resolve(__dirname, "packages/agent/src"),
      "@vibe/core": resolve(__dirname, "packages/core/src"),
      "@vibe/di": resolve(__dirname, "packages/di/src"),
      "@vibe/errors": resolve(__dirname, "packages/errors/src"),
      "@vibe/lifecycle": resolve(__dirname, "packages/lifecycle/src"),
      "@vibe/logger": resolve(__dirname, "packages/logger/src"),
      "@vibe/memory": resolve(__dirname, "packages/memory/src"),
      "@vibe/model": resolve(__dirname, "packages/model/src"),
      "@vibe/tools": resolve(__dirname, "packages/tools/src"),
      "@vibe/plugin": resolve(__dirname, "packages/plugin/src"),
      "@vibe/runtime": resolve(__dirname, "packages/runtime/src"),
      "@vibe/shared": resolve(__dirname, "packages/shared/src"),
      "@vibe/mcp-server": resolve(__dirname, "packages/mcp-server/src"),
      "@vibe/skills": resolve(__dirname, "packages/skills/src"),
      "@vibe/workflows": resolve(__dirname, "packages/workflows/src"),
      "@vibe/ontology": resolve(__dirname, "packages/ontology/src"),
      "@vibe/governance": resolve(__dirname, "packages/governance/src"),
      "@vibe/security": resolve(__dirname, "packages/security/src"),
      "@vibe/observability": resolve(__dirname, "packages/observability/src"),
    },
  },
})
