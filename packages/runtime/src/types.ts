import type { Brand } from "@vibe/shared"

export type ExecutionId = Brand<string, "ExecutionId">

export type TaskId = Brand<string, "TaskId">

export type CheckpointId = Brand<string, "CheckpointId">

export interface SerializedError {
  readonly name: string
  readonly message: string
  readonly stack: string | undefined
}

export type ExecutionState = "pending" | "running" | "completed" | "failed" | "cancelled"

export interface CancellationToken {
  readonly cancelled: boolean
  readonly reason: string | undefined
  onCancelled(listener: () => void): () => void
  throwIfCancelled(): void
}

export interface CancellationTokenSource {
  readonly token: CancellationToken
  cancel(reason?: string): void
}

export interface RetryPolicy {
  readonly maxAttempts: number
  readonly initialDelayMs: number
  readonly maxDelayMs: number
  readonly backoffMultiplier: number
}

export interface ExecutionContext {
  readonly executionId: ExecutionId
  readonly taskId: TaskId
  readonly attempt: number
  readonly cancellationToken: CancellationToken
  progress(value: unknown): void
  checkpoint(state: unknown): Promise<CheckpointId>
}

export type TaskHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: ExecutionContext,
) => Promise<TOutput>

export interface TaskDefinition<TInput = unknown, TOutput = unknown> {
  id: TaskId
  handler: TaskHandler<TInput, TOutput>
}

export interface ExecutionResult<TOutput = unknown> {
  readonly id: ExecutionId
  readonly taskId: TaskId
  readonly state: ExecutionState
  readonly output?: TOutput
  readonly error?: SerializedError
  readonly attempts: number
  readonly startedAt: number
  readonly completedAt?: number
  readonly durationMs?: number
}

export type StreamEvent<TOutput = unknown> =
  | { type: "start"; executionId: ExecutionId }
  | { type: "progress"; executionId: ExecutionId; value: unknown }
  | { type: "checkpoint"; executionId: ExecutionId; checkpointId: CheckpointId }
  | { type: "complete"; executionId: ExecutionId; result: ExecutionResult<TOutput> }
  | { type: "error"; executionId: ExecutionId; error: SerializedError }

export interface Checkpoint {
  readonly id: CheckpointId
  readonly executionId: ExecutionId
  readonly state: unknown
  readonly attempt: number
  readonly timestamp: number
}

export interface ScheduleOptions {
  readonly retry?: Partial<RetryPolicy>
  readonly timeoutMs?: number
}

export interface Scheduler {
  schedule<TInput, TOutput>(
    taskId: TaskId,
    input: TInput,
    options?: ScheduleOptions,
  ): Promise<ExecutionResult<TOutput>>
  cancel(executionId: ExecutionId): Promise<void>
  getStatus(executionId: ExecutionId): Promise<ExecutionResult | undefined>
}

export interface ResourceHandle {
  release(): void
}

export interface ResourceManager {
  acquire(name: string, limit: number, options?: { timeoutMs?: number }): Promise<ResourceHandle>
  getUsage(name: string): { active: number; max: number; pending: number }
}

export interface Runtime {
  readonly scheduler: Scheduler
  readonly resources: ResourceManager
  registerTask<TInput, TOutput>(definition: TaskDefinition<TInput, TOutput>): void
  execute<TInput, TOutput>(
    taskId: TaskId,
    input: TInput,
    options?: ScheduleOptions,
  ): Promise<ExecutionResult<TOutput>>
  stream<TInput, TOutput>(
    taskId: TaskId,
    input: TInput,
    options?: ScheduleOptions,
  ): AsyncIterable<StreamEvent<TOutput>>
  getExecution(executionId: ExecutionId): Promise<ExecutionResult | undefined>
  createCheckpoint(executionId: ExecutionId): Promise<Checkpoint | undefined>
  resumeFromCheckpoint<TOutput>(
    checkpoint: Checkpoint,
    taskId: TaskId,
  ): Promise<ExecutionResult<TOutput>>
}
