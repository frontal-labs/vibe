use serde::{Deserialize, Serialize};
use std::fmt;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ExecutionId(Uuid);

impl ExecutionId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub fn from_string(s: &str) -> Result<Self, uuid::Error> {
        Uuid::parse_str(s).map(Self)
    }

    pub fn as_uuid(&self) -> &Uuid {
        &self.0
    }

}

impl Default for ExecutionId {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Display for ExecutionId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<Uuid> for ExecutionId {
    fn from(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TaskId(Uuid);

impl TaskId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub fn from_string(s: &str) -> Result<Self, uuid::Error> {
        Uuid::parse_str(s).map(Self)
    }

    pub fn as_uuid(&self) -> &Uuid {
        &self.0
    }

}

impl Default for TaskId {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Display for TaskId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<Uuid> for TaskId {
    fn from(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CheckpointId(Uuid);

impl CheckpointId {
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }

    pub fn from_string(s: &str) -> Result<Self, uuid::Error> {
        Uuid::parse_str(s).map(Self)
    }

    pub fn as_uuid(&self) -> &Uuid {
        &self.0
    }

}

impl Default for CheckpointId {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Display for CheckpointId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl From<Uuid> for CheckpointId {
    fn from(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ExecutionState {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryPolicy {
    pub max_attempts: u32,
    pub base_delay_ms: u64,
    pub max_delay_ms: u64,
    pub backoff_multiplier: f64,
    pub retryable_errors: Vec<String>,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay_ms: 1000,
            max_delay_ms: 30000,
            backoff_multiplier: 2.0,
            retryable_errors: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct TokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StopReason {
    Stop,
    Length,
    ToolCalls,
    ContentFilter,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub execution_id: ExecutionId,
    pub state: ExecutionState,
    pub output: Option<serde_json::Value>,
    pub token_usage: TokenUsage,
    pub stop_reason: Option<StopReason>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointData {
    pub checkpoint_id: CheckpointId,
    pub execution_id: ExecutionId,
    pub task_id: TaskId,
    pub state: ExecutionState,
    pub context: serde_json::Value,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskDefinition {
    pub task_id: TaskId,
    pub name: String,
    pub description: Option<String>,
    pub schema: Option<serde_json::Value>,
    pub max_retries: u32,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StreamEvent {
    Chunk { data: serde_json::Value, sequence: u64 },
    Progress { percent: f64, message: String },
    ToolCall { name: String, arguments: serde_json::Value },
    ToolResult { name: String, result: serde_json::Value },
    Error { message: String, code: String },
    Done { result: ExecutionResult },
    Cancelled,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execution_id_new() {
        let id = ExecutionId::new();
        assert!(!id.to_string().is_empty());
    }

    #[test]
    fn test_execution_id_from_string() {
        let original = ExecutionId::new();
        let parsed = ExecutionId::from_string(&original.to_string()).unwrap();
        assert_eq!(original, parsed);
    }

    #[test]
    fn test_task_id_new() {
        let id = TaskId::new();
        assert!(!id.to_string().is_empty());
    }

    #[test]
    fn test_checkpoint_id_new() {
        let id = CheckpointId::new();
        assert!(!id.to_string().is_empty());
    }

    #[test]
    fn test_retry_policy_default() {
        let policy = RetryPolicy::default();
        assert_eq!(policy.max_attempts, 3);
        assert_eq!(policy.base_delay_ms, 1000);
        assert_eq!(policy.backoff_multiplier, 2.0);
    }

    #[test]
    fn test_token_usage_default() {
        let usage = TokenUsage::default();
        assert_eq!(usage.total_tokens, 0);
    }

    #[test]
    fn test_execution_state_roundtrip() {
        let states = vec![
            ExecutionState::Pending,
            ExecutionState::Running,
            ExecutionState::Completed,
            ExecutionState::Failed,
            ExecutionState::Cancelled,
        ];
        for state in states {
            let json = serde_json::to_string(&state).unwrap();
            let deserialized: ExecutionState = serde_json::from_str(&json).unwrap();
            assert_eq!(state, deserialized);
        }
    }

    #[test]
    fn test_stream_event_serialization() {
        let event = StreamEvent::Chunk {
            data: serde_json::json!({"text": "hello"}),
            sequence: 1,
        };
        let json = serde_json::to_string(&event).unwrap();
        let deserialized: StreamEvent = serde_json::from_str(&json).unwrap();
        assert!(matches!(deserialized, StreamEvent::Chunk { sequence: 1, .. }));
    }

    #[test]
    fn id_display_is_non_empty() {
        assert!(!ExecutionId::new().to_string().is_empty());
        assert!(!TaskId::new().to_string().is_empty());
        assert!(!CheckpointId::new().to_string().is_empty());
    }
}
