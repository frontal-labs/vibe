import type { Logger } from "@vibe/logger"
import type { ModelResponse, StopReason, TokenUsage } from "@vibe/model"
import type { CancellationToken } from "@vibe/runtime"

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
  /** Called for every event as the loop progresses (the `run()` observer hook). */
  onEvent?: (event: AgentEvent) => void
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
}

/** Events emitted as a run progresses (see `stream()` / `RunOptions.onEvent`). */
export type AgentEvent =
  | { type: "iteration"; iteration: number }
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "toolCall"; id: string; name: string; input: unknown }
  | { type: "toolResult"; id: string; name: string; content: string; isError: boolean }
  | { type: "done"; result: AgentResult }

/** A configured agent: run to completion, or stream events. */
export interface Agent {
  readonly model: string
  run(input: AgentInput, options?: RunOptions): Promise<AgentResult>
  stream(input: AgentInput, options?: RunOptions): AsyncGenerator<AgentEvent, AgentResult>
}

export type { ContentBlock, Effort } from "@vibe/model"
export type { Conversation } from "@vibe/memory"
