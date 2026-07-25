# vibe-execution

Concurrent execution engine with task scheduling, streaming, checkpoint/resume, and cancellation.

## Types

| Type | Description |
|------|-------------|
| `ExecutionEngine` | Core engine — manages `HashMap<ExecutionId, ExecutionContext>` via `DashMap` for concurrent access |
| `ExecutionContext` | Snapshot of an in-flight execution: id, task id, state, input, output, error, token usage, timestamps |
| `Checkpoint` | Serializable checkpoint linking a `CheckpointId` to an `ExecutionContext` |
| `ExecutionStream` | Async stream of `StreamEvent` values backed by an `mpsc::Receiver` |
| `ExecutionError` | Enum: `NotFound`, `TaskNotFound`, `AlreadyCompleted`, `Cancelled`, `Internal` |

### ExecutionEngine

| Method | Description |
|--------|-------------|
| `new()` | Creates a new engine with an internal `Scheduler` |
| `with_scheduler(scheduler)` | Creates an engine using a shared external scheduler |
| `register_task(task)` | Registers a `TaskDefinition` for execution |
| `execute(task_id, input) -> ExecutionResult` | Runs a task with the given JSON input and returns the final result |
| `stream(task_id, input) -> ExecutionStream` | Runs a task and returns an async stream of events |
| `checkpoint(execution_id) -> Checkpoint` | Creates a snapshot of an execution's current state |
| `resume(execution_id, checkpoint_id) -> ExecutionResult` | Restores an execution from a checkpoint |
| `cancel(execution_id)` | Marks an execution as cancelled |
| `get_execution(execution_id) -> Option<ExecutionContext>` | Retrieves the current execution context |
| `get_checkpoint(checkpoint_id) -> Option<Checkpoint>` | Retrieves a stored checkpoint |
| `active_executions() -> Vec<ExecutionId>` | Returns IDs of all running executions |
