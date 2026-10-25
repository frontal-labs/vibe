export type { ToolDefinition } from "./define-tool"
export { defineTool } from "./define-tool"
export type { RunToolOptions } from "./execute"
export { runToolCall } from "./execute"
export type { ToolRegistry } from "./registry"
export { createToolRegistry } from "./registry"
export { toJsonSchema } from "./to-json-schema"
export type {
  AnyTool,
  Tool,
  ToolContext,
  ToolHandler,
  ToolInput,
  ToolResult,
  ToolReturn,
  ToolSchema,
} from "./types"

import { nativeAddon } from "vibe/shared"

export function validateToolInput(schema: string, input: string): void {
  const addon = nativeAddon()
  if (addon?.validateToolInput) {
    addon.validateToolInput(schema, input)
  }
}
export { frameUntrustedOutput } from "./frame"
