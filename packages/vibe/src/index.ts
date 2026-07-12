// The `vibe` barrel. Prefer subpath imports (`import { createAgent } from "vibe/agent"`)
// for tree-shaking; this root re-exports the handful of everyday entry points.

export type { Agent, AgentEvent, AgentResult } from "@vibe/agent"
export { createAgent, createDelegateTool } from "@vibe/agent"
export type { System, SystemConfig } from "@vibe/core"
export { createSystem, vibe } from "@vibe/core"
export type { ModelProvider } from "@vibe/model"
export {
  createAnthropicProvider,
  createFakeProvider,
  DEFAULT_MODEL,
} from "@vibe/model"
export type { Tool } from "@vibe/tools"
export { createToolRegistry, defineTool, runToolCall } from "@vibe/tools"
