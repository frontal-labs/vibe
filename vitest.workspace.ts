import { defineWorkspace } from "vitest/config"

export default defineWorkspace([
  "packages/agent",
  "packages/core",
  "packages/di",
  "packages/errors",
  "packages/lifecycle",
  "packages/logger",
  "packages/memory",
  "packages/mcp-server",
  "packages/model",
  "packages/plugin",
  "packages/runtime",
  "packages/shared",
  "packages/tools",
  "packages/typescript-config",
])
