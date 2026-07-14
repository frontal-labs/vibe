import { runtimeError } from "@vibe/errors"

import type { ExecutionEngine } from "./execution-engine"
import type { ExecutionId, ExecutionResult, ScheduleOptions, Scheduler, TaskId } from "./types"

export function createScheduler(engine: ExecutionEngine): Scheduler {
  function schedule<TInput, TOutput>(
    taskId: TaskId,
    input: TInput,
    options?: ScheduleOptions,
  ): Promise<ExecutionResult<TOutput>> {
    const task = engine.getTask<TInput, TOutput>(taskId)
    if (!task) {
      throw runtimeError(`Task "${taskId}" is not registered`)
    }

    return engine.execute<TInput, TOutput>(taskId, input, options?.retry, options?.timeoutMs)
  }

  function cancel(executionId: ExecutionId): Promise<void> {
    const state = engine.getExecutionState(executionId)
    if (!state) {
      throw runtimeError(`Execution "${executionId}" not found`)
    }
    if (state !== "pending" && state !== "running") {
      return Promise.resolve()
    }
    engine.cancel(executionId)
    return Promise.resolve()
  }

  function getStatus(executionId: ExecutionId): Promise<ExecutionResult | undefined> {
    return Promise.resolve(engine.getResult(executionId))
  }

  return {
    schedule,
    cancel,
    getStatus,
  }
}
