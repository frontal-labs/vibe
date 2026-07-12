import { defineWorkspace } from "vitest/config"

export default defineWorkspace([
  "packages/adapters",
  "packages/agent",
  "packages/core",
  "packages/di",
  "packages/errors",
  "packages/evals",
  "packages/lifecycle",
  "packages/logger",
  "packages/memory",
  "packages/mcp-server",
  "packages/model",
  "packages/plugin",
  "packages/runtime",
  "packages/shared",
  "packages/tools",
  "packages/tracing",
  "packages/typescript-config",
])
