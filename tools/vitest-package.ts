import { defineConfig } from "vitest/config"

import { generateVibeAliases } from "./vite-utils"

/** Shared Vitest config for `packages/*`: resolves `vibe/*` to workspace sources. */
export function packageVitestConfig() {
  return defineConfig({
    resolve: {
      alias: generateVibeAliases(),
    },
    test: {
      include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
      exclude: ["node_modules", "dist", ".turbo"],
      globals: true,
      environment: "node",
      testTimeout: 20_000,
      hookTimeout: 10_000,
    },
  })
}
