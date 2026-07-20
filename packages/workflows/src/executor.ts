import type { Logger } from "vibe/logger"
import {
  type CancellationToken,
  createCancellationTokenSource,
  defaultRetryPolicy,
  executeWithRetry,
  type RetryPolicy,
  type SerializedError,
} from "vibe/runtime"

import { type CheckpointStore, createMemoryCheckpointStore } from "./checkpoint-store"
import type {
  Workflow,
  WorkflowContext,
  WorkflowEvent,
  WorkflowResult,
  WorkflowState,
  WorkflowStep,
  WorkflowTracer,
} from "./types"

export interface ExecuteWorkflowOptions {
  /** Stable id for this run — reuse it (with the same `store`) to resume. */
  runId?: string
  /** The workflow input (ignored on resume — the checkpointed input wins). */
  input?: unknown
  /** Where checkpoints are read/written. Defaults to a fresh in-memory store. */
  store?: CheckpointStore
  /** Shared cancellation for the whole tree; one `cancel()` stops every step. */
  cancellationToken?: CancellationToken
  /** Retry policy applied to every step (per-step `retry` overrides it). */
  retry?: Partial<RetryPolicy>
  tracer?: WorkflowTracer
  logger?: Logger
}

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack }
  }
  return { name: "UnknownError", message: String(error), stack: undefined }
}

let runCounter = 0
function nextRunId(name: string): string {
  runCounter += 1
  return `wf_${name}_${Date.now()}_${runCounter}`
}

/** Run a step once, or with retry when a policy is configured for it. */
function runStep(
  step: WorkflowStep,
  input: unknown,
  ctx: WorkflowContext,
  token: CancellationToken,
  defaultRetry: Partial<RetryPolicy> | undefined,
): Promise<unknown> {
  const retry = step.retry ?? defaultRetry
  if (!retry) return Promise.resolve(step.run(input, ctx))
  return executeWithRetry(() => Promise.resolve(step.run(input, ctx)), {
    policy: { ...defaultRetryPolicy(), ...retry },
    cancellationToken: token,
    timeoutMs: undefined,
  })
}

/**
 * Execute a workflow as a stream of {@link WorkflowEvent}s, checkpointing after
 * every step. Passing a `runId` + `store` from a previous (failed) run resumes it:
 * completed steps are skipped and execution continues from where it stopped. A
 * shared cancellation token stops the whole tree.
 */
export async function* executeWorkflow(
  workflow: Workflow,
  options: ExecuteWorkflowOptions = {},
): AsyncGenerator<WorkflowEvent, WorkflowResult> {
  const store = options.store ?? createMemoryCheckpointStore()
  const token = options.cancellationToken ?? createCancellationTokenSource().token
  const runId = options.runId ?? nextRunId(workflow.name)

  const prior = options.runId ? await store.load(runId) : undefined
  const resumed = prior !== undefined
  const state: WorkflowState = prior ?? {
    runId,
    workflow: workflow.name,
    input: options.input,
    outputs: {},
    completed: [],
    lastOutput: options.input,
  }

  const span = options.tracer?.startSpan(`workflow ${workflow.name}`)
  span?.setAttribute("workflow.runId", runId)
  span?.setAttribute("workflow.resumed", resumed)

  yield { type: "workflow:start", workflow: workflow.name, runId, resumed }

  let current = state.lastOutput
  try {
    for (const step of workflow.steps) {
      token.throwIfCancelled()

      if (state.completed.includes(step.id)) {
        current = state.outputs[step.id]
        yield { type: "step:skipped", step: step.id }
        continue
      }

      const stepSpan = options.tracer?.startSpan(`step ${step.id}`, span?.id)
      yield { type: "step:start", step: step.id }

      const ctx: WorkflowContext = {
        runId,
        cancellationToken: token,
        logger: options.logger,
        steps: state.outputs,
      }

      try {
        const output = await runStep(step, current, ctx, token, options.retry)
        state.outputs[step.id] = output
        state.completed.push(step.id)
        state.lastOutput = output
        current = output
        yield { type: "step:complete", step: step.id, output }

        await store.save(state)
        yield { type: "checkpoint", step: step.id }
        stepSpan?.setStatus("ok")
        stepSpan?.end()
      } catch (error) {
        stepSpan?.setStatus("error")
        stepSpan?.end()
        // Persist progress up to (not including) the failed step so resume can retry it.
        await store.save(state)
        const serialized = serializeError(error)
        yield { type: "step:error", step: step.id, error: serialized }

        const status = token.cancelled ? "cancelled" : "failed"
        span?.setStatus("error")
        span?.end()
        yield { type: "workflow:error", error: serialized }
        return {
          runId,
          workflow: workflow.name,
          status,
          output: current,
          outputs: state.outputs,
          error: serialized,
        }
      }
    }

    span?.setStatus("ok")
    span?.end()
    yield { type: "workflow:complete", output: current }
    return {
      runId,
      workflow: workflow.name,
      status: "completed",
      output: current,
      outputs: state.outputs,
    }
  } catch (error) {
    // Cancellation (or an error thrown outside a step, e.g. throwIfCancelled).
    const serialized = serializeError(error)
    span?.setStatus("error")
    span?.end()
    yield { type: "workflow:error", error: serialized }
    return {
      runId,
      workflow: workflow.name,
      status: token.cancelled ? "cancelled" : "failed",
      output: current,
      outputs: state.outputs,
      error: serialized,
    }
  }
}

/** Drain {@link executeWorkflow} to its {@link WorkflowResult}, forwarding events. */
export async function runWorkflow(
  workflow: Workflow,
  options: ExecuteWorkflowOptions & { onEvent?: (event: WorkflowEvent) => void } = {},
): Promise<WorkflowResult> {
  const gen = executeWorkflow(workflow, options)
  let next = await gen.next()
  while (!next.done) {
    options.onEvent?.(next.value)
    next = await gen.next()
  }
  return next.value
}
