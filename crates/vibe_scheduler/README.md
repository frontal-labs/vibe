# vibe-scheduler

Priority-based task scheduler with async dequeue, delayed dispatch, and cancellation integration.

## Types

| Type | Description |
|------|-------------|
| `Priority` | Enum: `Low`, `Normal`, `High`, `Critical` (ordered for BinaryHeap) |
| `ScheduledTask` | A task queued for execution — carries `task_id`, `execution_id`, `priority`, timestamp, and retry/timeout config |
| `PriorityQueue` | Type alias for `BinaryHeap<ScheduledTask>` (max-heap by priority) |
| `TaskQueue` | Wraps `PriorityQueue` with `enqueue`, `dequeue`, `peek`, `len`, `is_empty`, and a `Notify` for async wakeup |
| `SchedulerError` | Enum: `TaskNotFound`, `ExecutionNotFound`, `SchedulerFull`, `Cancelled` |

### Scheduler

| Method | Description |
|--------|-------------|
| `new(cancellation_token)` | Creates a scheduler bound to a cancellation token |
| `register_task(task)` | Registers a `TaskDefinition` for future scheduling |
| `unregister_task(task_id)` | Removes a registered task |
| `get_task(task_id)` | Looks up a registered task |
| `has_task(task_id) -> bool` | Checks if a task is registered |
| `schedule(task_id, priority, delay_ms) -> ScheduledTask` | Enqueues a task for execution (optionally delayed) |
| `dequeue() -> Option<ScheduledTask>` | Removes and returns the highest-priority task (non-blocking) |
| `dequeue_or_wait() -> Option<ScheduledTask>` | Blocks until a task is available or cancelled |
| `run() -> Option<ScheduledTask>` | Alias for `dequeue_or_wait` — blocks until a task can be executed |
| `queue_len() -> usize` | Returns the number of queued tasks |

### Free functions

| Function | Description |
|----------|-------------|
| `schedule_task(scheduler, task_id, priority)` | Convenience one-liner to enqueue a task at a given priority |
| `schedule_task_delayed(scheduler, task_id, priority, delay_ms)` | Enqueues a task with an initial delay |
