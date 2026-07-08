import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    typecheck: {
      enabled: true,
      include: ["type-tests/**/*.test.ts"],
    },
  },
})
