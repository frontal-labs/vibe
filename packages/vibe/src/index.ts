// The `vibe` barrel. Prefer subpath imports (`import { createAgent } from "vibe/agent"`)
// for tree-shaking; this root re-exports the handful of everyday entry points.

export type { Agent, AgentEvent, AgentResult } from "@vibe/agent"
export { createAgent, createDelegateTool } from "@vibe/agent"
export type { VibeConfig } from "@vibe/config"
export { defineConfig } from "@vibe/config"
export type { System, SystemConfig } from "@vibe/core"
export { createSystem, vibe } from "@vibe/core"
export { createApprovalGate, createPolicyEngine, guardTool } from "@vibe/governance"
export type { ModelProvider } from "@vibe/model"
export {
  createAnthropicProvider,
  createFakeProvider,
  createOpenAIProvider,
  DEFAULT_MODEL,
} from "@vibe/model"
export { createInMemoryOntologyStore, defineEntity } from "@vibe/ontology"
export { createContentGuard, redactPII } from "@vibe/security"
export { defineSkill, loadMarkdownSkill } from "@vibe/skills"
export type { Tool } from "@vibe/tools"
export { createToolRegistry, defineTool, runToolCall } from "@vibe/tools"
export { defineWorkflow, executeWorkflow, runWorkflow } from "@vibe/workflows"
