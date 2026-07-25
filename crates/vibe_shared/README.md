# vibe-shared

Shared foundational types for the Vibe runtime, used across all other crates.

## Types

| Type | Description |
|------|-------------|
| `ExecutionId` | UUID newtype wrapper — uniquely identifies an execution |
| `TaskId` | UUID newtype wrapper — uniquely identifies a task |
| `CheckpointId` | UUID newtype wrapper — uniquely identifies a checkpoint |
| `ExecutionState` | Enum: `Pending`, `Running`, `Completed`, `Failed`, `Cancelled` |
| `RetryPolicy` | Configuration for retry behaviour (`max_attempts`, `base_delay_ms`, `max_delay_ms`, `backoff_multiplier`, `retryable_errors`) |
| `TokenUsage` | Token consumption counters (`prompt_tokens`, `completion_tokens`, `total_tokens`) |
| `StopReason` | Enum: `Stop`, `Length`, `ToolCalls`, `ContentFilter`, `Error` |
| `ExecutionResult` | Full execution outcome — links `ExecutionId`, `ExecutionState`, optional output/error, `TokenUsage`, and `StopReason` |
| `CheckpointData` | Serialisable checkpoint snapshot linking `CheckpointId`, `ExecutionId`, `TaskId`, `ExecutionContext`, and timestamp |
| `TaskDefinition` | Static task metadata: id, name, description, JSON schema, max retries, timeout |
| `StreamEvent` | Enum covering streaming events: `Chunk`, `Progress`, `ToolCall`, `ToolResult`, `Error`, `Done`, `Cancelled` |

All types implement `Serialize`/`Deserialize` for seamless FFI across the napi boundary.
