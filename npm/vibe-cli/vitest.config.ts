import { defineConfig } from "vitest/config"

import { generateVibeAliases } from "../../tools/vite-utils"

export default defineConfig({
  resolve: {
    alias: generateVibeAliases(),
  },
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".turbo"],
    globals: true,
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 10_000,
  },
})
