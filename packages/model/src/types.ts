import type { KnownModelId } from "./catalog"

/** The default model — Anthropic's most capable Opus-tier model. */
export const DEFAULT_MODEL = "claude-opus-4-8"

/**
 * A model id. Autocompletes the {@link KnownModelId} catalog while still accepting
 * any custom string (`& {}` preserves the literal-union suggestions).
 */
export type ModelId = KnownModelId | (string & {})
export type Effort = "low" | "medium" | "high" | "xhigh" | "max"

/** Normalized stop reason (provider-specific reasons map into this). */
export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "pause"

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/** A normalized content block. Assistants emit text/thinking/toolUse; users send text/toolResult. */
export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "toolUse"; id: string; name: string; input: unknown }
  | { type: "toolResult"; toolUseId: string; content: string; isError?: boolean }

export interface Message {
  role: "user" | "assistant"
  content: string | ContentBlock[]
}

/** A model-facing tool schema (JSON Schema for the input). */
export interface ToolSchema {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export type ToolChoice = "auto" | "any" | "none" | { tool: string }

/** Reasoning configuration. Adaptive is the default; `budget_tokens` is not used. */
export type ThinkingConfig =
  | { type: "adaptive"; display?: "summarized" | "omitted" }
  | { type: "disabled" }

export interface ModelRequest {
  model: ModelId
  system?: string
  messages: Message[]
  tools?: ToolSchema[]
  toolChoice?: ToolChoice
  maxTokens?: number
  thinking?: ThinkingConfig
  effort?: Effort
  stream?: boolean
}

export interface ModelResponse {
  content: ContentBlock[]
  stopReason: StopReason
  usage: TokenUsage
  model: string
}

export type ModelStreamEvent =
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "toolUse"; id: string; name: string; input: unknown }
  | { type: "done"; response: ModelResponse }

/** The interface the agent loop depends on. Providers adapt vendor SDKs to it. */
export interface ModelProvider {
  readonly id: string
  generate(request: ModelRequest): Promise<ModelResponse>
  stream(request: ModelRequest): AsyncIterable<ModelStreamEvent>
  countTokens?(request: ModelRequest): Promise<number>
}
