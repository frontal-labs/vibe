import type { StandardSchemaV1 } from "@standard-schema/spec"
import type { Logger } from "@vibe/logger"
import type { ModelResponse, StopReason, TokenUsage } from "@vibe/model"
import type { CancellationToken } from "@vibe/runtime"
import type { AnyTool, Tool } from "@vibe/tools"

/** What the caller sends into a run. */
export type AgentInput = string | { text: string }

/** Per-run knobs. */
export interface RunOptions {
  /** Hard ceiling on model round-trips before the run aborts. Default 10. */
  maxIterations?: number
  cancellationToken?: CancellationToken
  logger?: Logger
  /** Per-tool wall-clock budget passed to `runToolCall`. */
  toolTimeoutMs?: number
  /**
   * Hard USD cost ceiling (in cents) for the run. Checked after each iteration against the
   * accumulated token usage; the run aborts with a runtime error once exceeded. Mirrors
   * `maxIterations` as a runaway-cost backstop.
   */
  maxCostCents?: number
  /** Called for every event as the loop progresses (the `run()` observer hook). */
  onEvent?: (event: AgentEvent) => void
  /** Actor/tenant id for attributing governance, rate-limit, and audit decisions. */
  actor?: string
}

/** Where a run's wall-clock time went, split by model round-trips vs tool execution. */
export interface RunTimings {
  /** Total loop wall-clock, milliseconds. */
  totalMs: number
  /** Aggregate model-call time and count. */
  model: { ms: number; calls: number }
  /** Aggregate tool-execution time and count. */
  tools: { ms: number; calls: number }
  /** Per-iteration breakdown, in order. */
  iterations: readonly { index: number; modelMs: number; toolsMs: number }[]
}

/** The terminal outcome of a run. */
export interface AgentResult {
  /** Concatenated text from the final assistant message. */
  text: string
  /** The last model response (its `stopReason` explains why the loop ended). */
  response: ModelResponse
  /** Summed token usage across every iteration. */
  usage: TokenUsage
  /** How many model round-trips the run took. */
  iterations: number
  /** Why the loop stopped: `end_turn` | `max_tokens` | `refusal`. */
  stopReason: StopReason
  /** Immutable snapshot of the full transcript. */
  transcript: import("@vibe/model").Message[]
  /** Where the run's wall-clock time went (model vs tools), per iteration and in total. */
  timings: RunTimings
}

/** The union of tool names in a tool set. */
export type ToolName<Tools extends readonly AnyTool[]> = Tools[number]["name"]

/** The `toolCall` event for one tool: its literal name and inferred input type. */
type ToolCall<T extends AnyTool> =
  T extends Tool<infer Name, infer Schema>
    ? { type: "toolCall"; id: string; name: Name; input: StandardSchemaV1.InferOutput<Schema> }
    : never

/**
 * The `toolCall` event union for a tool set — distributes over the tools so each
 * contributes its own `name` + `input`. For the default (dynamic) tool set this
 * collapses to `{ name: string; input: unknown }`.
 */
export type ToolCallEvent<Tools extends readonly AnyTool[]> = ToolCall<Tools[number]>

/**
 * Events emitted as a run progresses. Generic over the agent's tool set `Tools`, so
 * `toolCall.name`/`input` and `toolResult.name` narrow to that set. Defaults to the
 * dynamic (string-typed) tool set.
 */
export type AgentEvent<Tools extends readonly AnyTool[] = readonly AnyTool[]> =
  | { type: "iteration"; iteration: number }
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | ToolCallEvent<Tools>
  | { type: "toolResult"; id: string; name: ToolName<Tools>; content: string; isError: boolean }
  | { type: "timing"; iteration: number; modelMs: number; toolsMs: number }
  | { type: "done"; result: AgentResult }

/**
 * A configured agent: run to completion, or stream events. Generic over its tool
 * set so `stream()` yields tool-call events narrowed to exactly those tools.
 */
export interface Agent<Tools extends readonly AnyTool[] = readonly AnyTool[]> {
  readonly model: string
  run(input: AgentInput, options?: RunOptions): Promise<AgentResult>
  stream(input: AgentInput, options?: RunOptions): AsyncGenerator<AgentEvent<Tools>, AgentResult>
}

export type { Conversation } from "@vibe/memory"
export type { ContentBlock, Effort } from "@vibe/model"
