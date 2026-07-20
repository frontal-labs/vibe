import type { Logger } from "vibe/logger"
import type { CancellationToken, RetryPolicy, SerializedError } from "vibe/runtime"

/**
 * Ambient context handed to every step. `steps` holds the outputs of already-
 * completed steps (keyed by id) so a step can read upstream results; the shared
 * `cancellationToken` propagates through the whole tree (agents, tools, sub-workflows).
 */
export interface WorkflowContext {
  readonly runId: string
  readonly cancellationToken: CancellationToken
  readonly logger?: Logger
  readonly steps: Readonly<Record<string, unknown>>
}

/**
 * A single workflow step. `run` receives the previous step's output and may invoke
 * an agent, tool, skill, or sub-workflow. Optional per-step `retry` overrides the
 * workflow default.
 */
export interface WorkflowStep<Input = unknown, Output = unknown> {
  readonly id: string
  readonly retry?: Partial<RetryPolicy>
  run(input: Input, ctx: WorkflowContext): Output | Promise<Output>
}

/** A code-first workflow: an ordered, typed graph of steps. */
export interface Workflow {
  readonly name: string
  readonly description?: string
  readonly steps: readonly WorkflowStep[]
}

/** Persisted, resumable state for one workflow run — the checkpoint payload. */
export interface WorkflowState {
  readonly runId: string
  readonly workflow: string
  input: unknown
  outputs: Record<string, unknown>
  completed: string[]
  lastOutput: unknown
}

/** Events emitted as a workflow runs (mirrors the runtime `StreamEvent` shape). */
export type WorkflowEvent =
  | { type: "workflow:start"; workflow: string; runId: string; resumed: boolean }
  | { type: "step:start"; step: string }
  | { type: "step:skipped"; step: string }
  | { type: "step:complete"; step: string; output: unknown }
  | { type: "checkpoint"; step: string }
  | { type: "step:error"; step: string; error: SerializedError }
  | { type: "workflow:complete"; output: unknown }
  | { type: "workflow:error"; error: SerializedError }

export type WorkflowStatus = "completed" | "failed" | "cancelled"

/** The terminal outcome of a workflow run. */
export interface WorkflowResult {
  readonly runId: string
  readonly workflow: string
  readonly status: WorkflowStatus
  readonly output: unknown
  readonly outputs: Readonly<Record<string, unknown>>
  readonly error?: SerializedError
}

/** A minimal tracer surface — structurally satisfied by `vibe/tracing`'s `Tracer`. */
export interface WorkflowSpan {
  setAttribute(key: string, value: unknown): void
  setStatus(status: "ok" | "error"): void
  end(): unknown
  readonly id: string
}
export interface WorkflowTracer {
  startSpan(name: string, parent?: string): WorkflowSpan
}
