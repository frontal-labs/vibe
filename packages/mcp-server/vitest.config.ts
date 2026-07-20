import { resolve } from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".turbo"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "vibe/agent": resolve(__dirname, "../agent/src"),
      "vibe/core": resolve(__dirname, "../core/src"),
      "vibe/di": resolve(__dirname, "../di/src"),
      "vibe/errors": resolve(__dirname, "../errors/src"),
      "vibe/lifecycle": resolve(__dirname, "../lifecycle/src"),
      "vibe/logger": resolve(__dirname, "../logger/src"),
      "vibe/memory": resolve(__dirname, "../memory/src"),
      "vibe/model": resolve(__dirname, "../model/src"),
      "vibe/plugin": resolve(__dirname, "../plugin/src"),
      "vibe/runtime": resolve(__dirname, "../runtime/src"),
      "vibe/shared": resolve(__dirname, "../shared/src"),
      "vibe/tools": resolve(__dirname, "../tools/src"),
    },
  },
})
