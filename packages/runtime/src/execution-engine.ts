import { runtimeError } from "@vibe/errors"

import { createCancellationTokenSource } from "./cancellation"
import { createResourceManager } from "./resource-manager"
import { defaultRetryPolicy, executeWithRetry } from "./retry"
import { createScheduler } from "./scheduler"
import type {
  Checkpoint,
  CheckpointId,
  ExecutionContext,
  ExecutionId,
  ExecutionResult,
  ExecutionState,
  RetryPolicy,
  Runtime,
  StreamEvent,
  TaskDefinition,
  TaskId,
} from "./types"
import type { Scheduler } from "./types"
import type { ResourceManager } from "./types"

let executionCounter = 0

function createExecutionId(): ExecutionId {
  executionCounter++
  return `exec_${Date.now()}_${executionCounter}` as ExecutionId
}

function createCheckpointId(): CheckpointId {
  executionCounter++
  return `ckpt_${Date.now()}_${executionCounter}` as CheckpointId
}

export interface SerializedError {
  readonly name: string
  readonly message: string
  readonly stack: string | undefined
}

export interface ExecutionEngine {
  registerTask<TInput, TOutput>(definition: TaskDefinition<TInput, TOutput>): void
  getTask<TInput, TOutput>(taskId: TaskId): TaskDefinition<TInput, TOutput> | undefined
  execute<TInput, TOutput>(
    taskId: TaskId,
    input: TInput,
    retry?: Partial<RetryPolicy>,
    timeoutMs?: number,
  ): Promise<ExecutionResult<TOutput>>
  stream<TInput, TOutput>(
    taskId: TaskId,
    input: TInput,
    retry?: Partial<RetryPolicy>,
    timeoutMs?: number,
  ): AsyncIterable<StreamEvent<TOutput>>
  cancel(executionId: ExecutionId): void
  getResult(executionId: ExecutionId): ExecutionResult | undefined
  saveCheckpoint(executionId: ExecutionId, state: unknown): Checkpoint
  getCheckpoint(executionId: ExecutionId): Checkpoint | undefined
  resumeFromCheckpoint<TOutput>(
    checkpoint: Checkpoint,
    taskId: TaskId,
  ): Promise<ExecutionResult<TOutput>>
  getExecutionState(executionId: ExecutionId): ExecutionState | undefined
  listActiveExecutions(): Array<{
    id: ExecutionId
    taskId: TaskId
    state: ExecutionState
  }>
}

export function createExecutionEngine(): ExecutionEngine {
  const tasks = new Map<string, TaskDefinition>()
  const executions = new Map<string, ExecutionState>()
  const results = new Map<string, ExecutionResult>()
  const checkpoints = new Map<string, Checkpoint>()
  const cancellationSources = new Map<string, ReturnType<typeof createCancellationTokenSource>>()

  function registerTask<TInput, TOutput>(definition: TaskDefinition<TInput, TOutput>): void {
    const key = definition.id as string
    if (tasks.has(key)) {
      throw runtimeError(`Task "${key}" is already registered`)
    }
    tasks.set(key, definition as TaskDefinition)
  }

  function getTask<TInput, TOutput>(taskId: TaskId): TaskDefinition<TInput, TOutput> | undefined {
    return tasks.get(taskId as string) as TaskDefinition<TInput, TOutput> | undefined
  }

  async function execute<TInput, TOutput>(
    taskId: TaskId,
    input: TInput,
    retry?: Partial<RetryPolicy>,
    timeoutMs?: number,
  ): Promise<ExecutionResult<TOutput>> {
    const task = tasks.get(taskId as string) as TaskDefinition<TInput, TOutput> | undefined
    if (!task) {
      throw runtimeError(`Task "${taskId}" is not registered`)
    }

    const executionId = createExecutionId()
    const startedAt = Date.now()
    executions.set(executionId as string, "pending")

    const source = createCancellationTokenSource()
    cancellationSources.set(executionId as string, source)

    const policy: RetryPolicy = retry ? { ...defaultRetryPolicy(), ...retry } : defaultRetryPolicy()

    const progressListeners = new Set<(value: unknown) => void>()

    async function handleProgress(value: unknown): Promise<void> {
      for (const listener of progressListeners) {
        listener(value)
      }
    }

    let currentAttempt = 0

    const ctx: ExecutionContext = {
      executionId,
      taskId,
      attempt: 0,
      cancellationToken: source.token,
      progress: handleProgress,
      checkpoint: async (state: unknown) => {
        const ckpt = saveCheckpoint(executionId, state)
        return ckpt.id
      },
    }

    try {
      executions.set(executionId as string, "running")

      const output = await executeWithRetry(
        async () => {
          currentAttempt++
          return task.handler(input, ctx)
        },
        {
          policy,
          cancellationToken: source.token,
          timeoutMs,
        },
      )

      const durationMs = Date.now() - startedAt
      executions.set(executionId as string, "completed")

      const result: ExecutionResult<TOutput> = {
        id: executionId,
        taskId,
        state: "completed",
        output,
        attempts: currentAttempt,
        startedAt,
        completedAt: Date.now(),
        durationMs,
      }
      results.set(executionId as string, result as ExecutionResult)
      return result
    } catch (error) {
      const durationMs = Date.now() - startedAt
      const state: ExecutionState = source.token.cancelled ? "cancelled" : "failed"
      executions.set(executionId as string, state)

      const result: ExecutionResult<TOutput> = {
        id: executionId,
        taskId,
        state,
        error: serializeError(error),
        attempts: currentAttempt,
        startedAt,
        completedAt: Date.now(),
        durationMs,
      }
      results.set(executionId as string, result as ExecutionResult)
      return result
    } finally {
      cancellationSources.delete(executionId as string)
    }
  }

  async function* stream<TInput, TOutput>(
    taskId: TaskId,
    input: TInput,
    retry?: Partial<RetryPolicy>,
    timeoutMs?: number,
  ): AsyncIterable<StreamEvent<TOutput>> {
    const task = tasks.get(taskId as string) as TaskDefinition<TInput, TOutput> | undefined
    if (!task) {
      throw runtimeError(`Task "${taskId}" is not registered`)
    }

    const executionId = createExecutionId()
    const startedAt = Date.now()
    executions.set(executionId as string, "pending")

    const source = createCancellationTokenSource()
    cancellationSources.set(executionId as string, source)

    const policy: RetryPolicy = retry ? { ...defaultRetryPolicy(), ...retry } : defaultRetryPolicy()

    const progressEvents: Array<unknown> = []

    let currentAttempt = 0

    const ctx: ExecutionContext = {
      executionId,
      taskId,
      attempt: 0,
      cancellationToken: source.token,
      progress: (value: unknown) => {
        progressEvents.push(value)
      },
      checkpoint: async (state: unknown) => {
        const ckpt = saveCheckpoint(executionId, state)
        return ckpt.id
      },
    }

    yield { type: "start", executionId }

    try {
      executions.set(executionId as string, "running")

      const output = await executeWithRetry(
        async () => {
          currentAttempt++
          return task.handler(input, ctx)
        },
        {
          policy,
          cancellationToken: source.token,
          timeoutMs,
        },
      )

      for (const value of progressEvents) {
        yield { type: "progress", executionId, value }
      }

      const durationMs = Date.now() - startedAt
      executions.set(executionId as string, "completed")

      const result: ExecutionResult<TOutput> = {
        id: executionId,
        taskId,
        state: "completed",
        output,
        attempts: currentAttempt,
        startedAt,
        completedAt: Date.now(),
        durationMs,
      }
      results.set(executionId as string, result as ExecutionResult)
      yield { type: "complete", executionId, result }
    } catch (error) {
      const state: ExecutionState = source.token.cancelled ? "cancelled" : "failed"
      executions.set(executionId as string, state)

      for (const value of progressEvents) {
        yield { type: "progress", executionId, value }
      }

      const errSerialized = serializeError(error)
      yield { type: "error", executionId, error: errSerialized }
    } finally {
      cancellationSources.delete(executionId as string)
    }
  }

  function cancel(executionId: ExecutionId): void {
    const source = cancellationSources.get(executionId as string)
    if (source) {
      source.cancel()
    }
  }

  function getResult(executionId: ExecutionId): ExecutionResult | undefined {
    return results.get(executionId as string)
  }

  function saveCheckpoint(executionId: ExecutionId, state: unknown): Checkpoint {
    const id = createCheckpointId()
    const ckpt: Checkpoint = {
      id,
      executionId,
      state,
      attempt: 0,
      timestamp: Date.now(),
    }
    checkpoints.set(id as string, ckpt)
    return ckpt
  }

  function getCheckpoint(executionId: ExecutionId): Checkpoint | undefined {
    for (const ckpt of checkpoints.values()) {
      if (ckpt.executionId === executionId) {
        return ckpt
      }
    }
    return undefined
  }

  async function resumeFromCheckpoint<TOutput>(
    checkpoint: Checkpoint,
    taskId: TaskId,
  ): Promise<ExecutionResult<TOutput>> {
    const task = tasks.get(taskId as string) as TaskDefinition<unknown, TOutput> | undefined
    if (!task) {
      throw runtimeError(`Task "${taskId}" is not registered`)
    }

    return execute(taskId, checkpoint.state)
  }

  function getExecutionState(executionId: ExecutionId): ExecutionState | undefined {
    return executions.get(executionId as string)
  }

  function listActiveExecutions(): Array<{
    id: ExecutionId
    taskId: TaskId
    state: ExecutionState
  }> {
    const active: Array<{
      id: ExecutionId
      taskId: TaskId
      state: ExecutionState
    }> = []
    for (const [id, state] of executions) {
      if (state === "pending" || state === "running") {
        const result = results.get(id)
        active.push({
          id: id as ExecutionId,
          taskId: (result?.taskId ?? id) as TaskId,
          state,
        })
      }
    }
    return active
  }

  return {
    registerTask,
    getTask,
    execute,
    stream,
    cancel,
    getResult,
    saveCheckpoint,
    getCheckpoint,
    resumeFromCheckpoint,
    getExecutionState,
    listActiveExecutions,
  }
}

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  return {
    name: "UnknownError",
    message: String(error),
    stack: undefined,
  }
}

export function createRuntime(): Runtime {
  const engine = createExecutionEngine()
  const scheduler: Scheduler = createScheduler(engine)
  const resources: ResourceManager = createResourceManager()

  return {
    scheduler,
    resources,
    registerTask: (definition) => engine.registerTask(definition),
    execute: (taskId, input, options) =>
      engine.execute(taskId, input, options?.retry, options?.timeoutMs),
    stream: (taskId, input, options) =>
      engine.stream(taskId, input, options?.retry, options?.timeoutMs),
    getExecution: async (executionId) => engine.getResult(executionId),
    createCheckpoint: async (executionId) => engine.getCheckpoint(executionId),
    resumeFromCheckpoint: (checkpoint, taskId) => engine.resumeFromCheckpoint(checkpoint, taskId),
  }
}
