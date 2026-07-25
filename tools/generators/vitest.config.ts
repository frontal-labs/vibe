import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".turbo"],
    globals: true,
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 10_000,
  },
})
