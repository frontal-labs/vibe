export { createCancellationTokenSource } from "./cancellation"
export type { ExecutionEngine } from "./execution-engine"
export { createExecutionEngine, createRuntime } from "./execution-engine"
export { createResourceManager } from "./resource-manager"
export type { RetryableOptions } from "./retry"
export {
  calculateDelay,
  defaultRetryPolicy,
  executeWithRetry,
  isRetryableError,
} from "./retry"
export { createScheduler } from "./scheduler"
export type {
  CancellationToken,
  CancellationTokenSource,
  Checkpoint,
  CheckpointId,
  ExecutionContext,
  ExecutionId,
  ExecutionResult,
  ExecutionState,
  ResourceHandle,
  ResourceManager,
  RetryPolicy,
  Runtime,
  ScheduleOptions,
  Scheduler,
  SerializedError,
  StreamEvent,
  TaskDefinition,
  TaskHandler,
  TaskId,
} from "./types"

import { nativeAddon } from "@@vibe/shared"

function generateExecutionId(): string {
  const addon = nativeAddon()
  if (addon?.generateExecutionId) {
    return addon.generateExecutionId()
  }
  return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

function generateTaskId(): string {
  const addon = nativeAddon()
  if (addon?.generateTaskId) {
    return addon.generateTaskId()
  }
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

function generateCheckpointId(): string {
  const addon = nativeAddon()
  if (addon?.generateCheckpointId) {
    return addon.generateCheckpointId()
  }
  return `ckpt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

export type {
  JsCancellationToken,
  JsCancellationTokenSource,
  JsNativeCancellationToken,
  JsNativeCancellationTokenSource,
  JsNativeExecutionEngine,
  JsNativeExecutionResult,
  JsNativeRetryPolicy,
  NativeAddon,
} from "@@vibe/shared"
export { nativeAddon } from "@@vibe/shared"
export { generateCheckpointId, generateExecutionId, generateTaskId }
