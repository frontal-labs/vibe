// Tests for serialization roundtrips of all public types in vibe_shared.
// Covers: ExecutionId, TaskId, CheckpointId, RetryPolicy, TokenUsage,
// ExecutionState, StopReason, StreamEvent, ExecutionResult, CheckpointData, TaskDefinition.
use vibe_shared::*;

#[test]
fn test_execution_id_new() {
    let id = ExecutionId::new();
    assert!(!id.to_string().is_empty());
}

#[test]
fn test_execution_id_from_string_valid() {
    let original = ExecutionId::new();
    let parsed = ExecutionId::from_string(&original.to_string()).unwrap();
    assert_eq!(original, parsed);
}

#[test]
fn test_execution_id_from_string_invalid() {
    let result = ExecutionId::from_string("not-a-valid-uuid");
    assert!(result.is_err());

    let result = ExecutionId::from_string("");
    assert!(result.is_err());
}

#[test]
fn test_execution_id_display() {
    let id = ExecutionId::new();
    let s = id.to_string();
    assert!(!s.is_empty());
    assert!(s.contains('-'));
}

#[test]
fn test_execution_id_serde_roundtrip() {
    let id = ExecutionId::new();
    let json = serde_json::to_string(&id).unwrap();
    let deserialized: ExecutionId = serde_json::from_str(&json).unwrap();
    assert_eq!(id, deserialized);
}

#[test]
fn test_task_id_new() {
    let id = TaskId::new();
    assert!(!id.to_string().is_empty());
}

#[test]
fn test_task_id_from_string_valid() {
    let original = TaskId::new();
    let parsed = TaskId::from_string(&original.to_string()).unwrap();
    assert_eq!(original, parsed);
}

#[test]
fn test_task_id_from_string_invalid() {
    let result = TaskId::from_string("invalid");
    assert!(result.is_err());
}

#[test]
fn test_task_id_display() {
    let id = TaskId::new();
    let s = id.to_string();
    assert!(!s.is_empty());
    assert!(s.contains('-'));
}

#[test]
fn test_task_id_serde_roundtrip() {
    let id = TaskId::new();
    let json = serde_json::to_string(&id).unwrap();
    let deserialized: TaskId = serde_json::from_str(&json).unwrap();
    assert_eq!(id, deserialized);
}

#[test]
fn test_checkpoint_id_new() {
    let id = CheckpointId::new();
    assert!(!id.to_string().is_empty());
}

#[test]
fn test_checkpoint_id_from_string_valid() {
    let original = CheckpointId::new();
    let parsed = CheckpointId::from_string(&original.to_string()).unwrap();
    assert_eq!(original, parsed);
}

#[test]
fn test_checkpoint_id_from_string_invalid() {
    let result = CheckpointId::from_string("bad-input");
    assert!(result.is_err());
}

#[test]
fn test_checkpoint_id_display() {
    let id = CheckpointId::new();
    let s = id.to_string();
    assert!(!s.is_empty());
    assert!(s.contains('-'));
}

#[test]
fn test_checkpoint_id_serde_roundtrip() {
    let id = CheckpointId::new();
    let json = serde_json::to_string(&id).unwrap();
    let deserialized: CheckpointId = serde_json::from_str(&json).unwrap();
    assert_eq!(id, deserialized);
}

#[test]
fn test_retry_policy_default_values() {
    let policy = RetryPolicy::default();
    assert_eq!(policy.max_attempts, 3);
    assert_eq!(policy.base_delay_ms, 1000);
    assert_eq!(policy.max_delay_ms, 30000);
    assert_eq!(policy.backoff_multiplier, 2.0);
    assert!(policy.retryable_errors.is_empty());
}

#[test]
fn test_retry_policy_custom_values() {
    let policy = RetryPolicy {
        max_attempts: 5,
        base_delay_ms: 500,
        max_delay_ms: 10000,
        backoff_multiplier: 1.5,
        retryable_errors: vec!["timeout".to_string(), "rate_limit".to_string()],
    };
    assert_eq!(policy.max_attempts, 5);
    assert_eq!(policy.base_delay_ms, 500);
    assert_eq!(policy.max_delay_ms, 10000);
    assert_eq!(policy.backoff_multiplier, 1.5);
    assert_eq!(policy.retryable_errors.len(), 2);
}

#[test]
fn test_retry_policy_serde_roundtrip() {
    let policy = RetryPolicy {
        max_attempts: 10,
        base_delay_ms: 100,
        max_delay_ms: 60000,
        backoff_multiplier: 3.0,
        retryable_errors: vec!["error".to_string()],
    };
    let json = serde_json::to_string(&policy).unwrap();
    let deserialized: RetryPolicy = serde_json::from_str(&json).unwrap();
    assert_eq!(policy.max_attempts, deserialized.max_attempts);
    assert_eq!(policy.base_delay_ms, deserialized.base_delay_ms);
    assert_eq!(policy.max_delay_ms, deserialized.max_delay_ms);
    assert_eq!(policy.backoff_multiplier, deserialized.backoff_multiplier);
    assert_eq!(policy.retryable_errors, deserialized.retryable_errors);
}

#[test]
fn test_token_usage_default() {
    let usage = TokenUsage::default();
    assert_eq!(usage.prompt_tokens, 0);
    assert_eq!(usage.completion_tokens, 0);
    assert_eq!(usage.total_tokens, 0);
}

#[test]
fn test_token_usage_custom_values() {
    let usage = TokenUsage {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
    };
    assert_eq!(usage.prompt_tokens, 100);
    assert_eq!(usage.total_tokens, 150);
}

#[test]
fn test_token_usage_serde_roundtrip() {
    let usage = TokenUsage {
        prompt_tokens: 200,
        completion_tokens: 300,
        total_tokens: 500,
    };
    let json = serde_json::to_string(&usage).unwrap();
    let deserialized: TokenUsage = serde_json::from_str(&json).unwrap();
    assert_eq!(usage, deserialized);
}

#[test]
fn test_execution_state_all_variants_serde_roundtrip() {
    let variants = vec![
        ExecutionState::Pending,
        ExecutionState::Running,
        ExecutionState::Completed,
        ExecutionState::Failed,
        ExecutionState::Cancelled,
    ];
    for variant in variants {
        let json = serde_json::to_string(&variant).unwrap();
        let deserialized: ExecutionState = serde_json::from_str(&json).unwrap();
        assert_eq!(variant, deserialized);
    }
}

#[test]
fn test_execution_state_json_strings() {
    assert_eq!(
        serde_json::to_string(&ExecutionState::Pending).unwrap(),
        "\"Pending\""
    );
    assert_eq!(
        serde_json::to_string(&ExecutionState::Running).unwrap(),
        "\"Running\""
    );
    assert_eq!(
        serde_json::to_string(&ExecutionState::Completed).unwrap(),
        "\"Completed\""
    );
    assert_eq!(
        serde_json::to_string(&ExecutionState::Failed).unwrap(),
        "\"Failed\""
    );
    assert_eq!(
        serde_json::to_string(&ExecutionState::Cancelled).unwrap(),
        "\"Cancelled\""
    );
}

#[test]
fn test_stop_reason_all_variants_serde_roundtrip() {
    let variants = vec![
        StopReason::Stop,
        StopReason::Length,
        StopReason::ToolCalls,
        StopReason::ContentFilter,
        StopReason::Error,
    ];
    for variant in variants {
        let json = serde_json::to_string(&variant).unwrap();
        let deserialized: StopReason = serde_json::from_str(&json).unwrap();
        assert_eq!(variant, deserialized);
    }
}

#[test]
fn test_stop_reason_json_strings() {
    assert_eq!(
        serde_json::to_string(&StopReason::Stop).unwrap(),
        "\"Stop\""
    );
    assert_eq!(
        serde_json::to_string(&StopReason::Length).unwrap(),
        "\"Length\""
    );
    assert_eq!(
        serde_json::to_string(&StopReason::ToolCalls).unwrap(),
        "\"ToolCalls\""
    );
    assert_eq!(
        serde_json::to_string(&StopReason::ContentFilter).unwrap(),
        "\"ContentFilter\""
    );
    assert_eq!(
        serde_json::to_string(&StopReason::Error).unwrap(),
        "\"Error\""
    );
}

#[test]
fn test_stream_event_chunk_roundtrip() {
    let event = StreamEvent::Chunk {
        data: serde_json::json!({"text": "hello"}),
        sequence: 1,
    };
    let json = serde_json::to_string(&event).unwrap();
    let deserialized: StreamEvent = serde_json::from_str(&json).unwrap();
    assert!(matches!(
        deserialized,
        StreamEvent::Chunk { sequence: 1, .. }
    ));
}

#[test]
fn test_stream_event_progress_roundtrip() {
    let event = StreamEvent::Progress {
        percent: 50.0,
        message: "halfway".to_string(),
    };
    let json = serde_json::to_string(&event).unwrap();
    let deserialized: StreamEvent = serde_json::from_str(&json).unwrap();
    assert!(matches!(
        deserialized,
        StreamEvent::Progress { percent: 50.0, .. }
    ));
}

#[test]
fn test_stream_event_tool_call_roundtrip() {
    let event = StreamEvent::ToolCall {
        name: "get_weather".to_string(),
        arguments: serde_json::json!({"location": "NYC"}),
    };
    let json = serde_json::to_string(&event).unwrap();
    let deserialized: StreamEvent = serde_json::from_str(&json).unwrap();
    assert!(
        matches!(deserialized, StreamEvent::ToolCall { ref name, .. } if name == "get_weather")
    );
}

#[test]
fn test_stream_event_tool_result_roundtrip() {
    let event = StreamEvent::ToolResult {
        name: "get_weather".to_string(),
        result: serde_json::json!({"temp": 72}),
    };
    let json = serde_json::to_string(&event).unwrap();
    let deserialized: StreamEvent = serde_json::from_str(&json).unwrap();
    assert!(
        matches!(deserialized, StreamEvent::ToolResult { ref name, .. } if name == "get_weather")
    );
}

#[test]
fn test_stream_event_error_roundtrip() {
    let event = StreamEvent::Error {
        message: "something went wrong".to_string(),
        code: "ERR_001".to_string(),
    };
    let json = serde_json::to_string(&event).unwrap();
    let deserialized: StreamEvent = serde_json::from_str(&json).unwrap();
    assert!(matches!(deserialized, StreamEvent::Error { ref code, .. } if code == "ERR_001"));
}

#[test]
fn test_stream_event_done_roundtrip() {
    let result = ExecutionResult {
        execution_id: ExecutionId::new(),
        state: ExecutionState::Completed,
        output: Some(serde_json::json!({"result": "done"})),
        token_usage: TokenUsage {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
        },
        stop_reason: Some(StopReason::Stop),
        error: None,
    };
    let event = StreamEvent::Done { result };
    let json = serde_json::to_string(&event).unwrap();
    let deserialized: StreamEvent = serde_json::from_str(&json).unwrap();
    assert!(matches!(deserialized, StreamEvent::Done { .. }));
}

#[test]
fn test_stream_event_cancelled_roundtrip() {
    let event = StreamEvent::Cancelled;
    let json = serde_json::to_string(&event).unwrap();
    let deserialized: StreamEvent = serde_json::from_str(&json).unwrap();
    assert!(matches!(deserialized, StreamEvent::Cancelled));
}

#[test]
fn test_execution_result_serde_roundtrip() {
    let result = ExecutionResult {
        execution_id: ExecutionId::new(),
        state: ExecutionState::Completed,
        output: Some(serde_json::json!({"key": "value"})),
        token_usage: TokenUsage {
            prompt_tokens: 50,
            completion_tokens: 100,
            total_tokens: 150,
        },
        stop_reason: Some(StopReason::ToolCalls),
        error: None,
    };
    let json = serde_json::to_string(&result).unwrap();
    let deserialized: ExecutionResult = serde_json::from_str(&json).unwrap();
    assert_eq!(result.state, deserialized.state);
    assert_eq!(result.output, deserialized.output);
    assert_eq!(result.token_usage, deserialized.token_usage);
    assert_eq!(result.stop_reason, deserialized.stop_reason);
    assert_eq!(result.error, deserialized.error);
}

#[test]
fn test_execution_result_with_error_roundtrip() {
    let result = ExecutionResult {
        execution_id: ExecutionId::new(),
        state: ExecutionState::Failed,
        output: None,
        token_usage: TokenUsage::default(),
        stop_reason: None,
        error: Some("execution failed".to_string()),
    };
    let json = serde_json::to_string(&result).unwrap();
    let deserialized: ExecutionResult = serde_json::from_str(&json).unwrap();
    assert_eq!(result.state, deserialized.state);
    assert_eq!(result.error, deserialized.error);
    assert!(deserialized.output.is_none());
}

#[test]
fn test_checkpoint_data_serde_roundtrip() {
    let data = CheckpointData {
        checkpoint_id: CheckpointId::new(),
        execution_id: ExecutionId::new(),
        task_id: TaskId::new(),
        state: ExecutionState::Running,
        context: serde_json::json!({"progress": 0.5, "status": "in_progress"}),
        created_at: 1700000000,
    };
    let json = serde_json::to_string(&data).unwrap();
    let deserialized: CheckpointData = serde_json::from_str(&json).unwrap();
    assert_eq!(data.state, deserialized.state);
    assert_eq!(data.context, deserialized.context);
    assert_eq!(data.created_at, deserialized.created_at);
}

#[test]
fn test_checkpoint_data_minimal_roundtrip() {
    let data = CheckpointData {
        checkpoint_id: CheckpointId::new(),
        execution_id: ExecutionId::new(),
        task_id: TaskId::new(),
        state: ExecutionState::Pending,
        context: serde_json::Value::Null,
        created_at: 0,
    };
    let json = serde_json::to_string(&data).unwrap();
    let deserialized: CheckpointData = serde_json::from_str(&json).unwrap();
    assert_eq!(data.state, deserialized.state);
    assert_eq!(deserialized.context, serde_json::Value::Null);
}

#[test]
fn test_task_definition_serde_roundtrip() {
    let task = TaskDefinition {
        task_id: TaskId::new(),
        name: "test-task".to_string(),
        description: Some("A test task definition".to_string()),
        schema: Some(serde_json::json!({"type": "object", "properties": {}})),
        max_retries: 3,
        timeout_ms: Some(5000),
    };
    let json = serde_json::to_string(&task).unwrap();
    let deserialized: TaskDefinition = serde_json::from_str(&json).unwrap();
    assert_eq!(task.name, deserialized.name);
    assert_eq!(task.description, deserialized.description);
    assert_eq!(task.schema, deserialized.schema);
    assert_eq!(task.max_retries, deserialized.max_retries);
    assert_eq!(task.timeout_ms, deserialized.timeout_ms);
}

#[test]
fn test_task_definition_no_optionals_roundtrip() {
    let task = TaskDefinition {
        task_id: TaskId::new(),
        name: "minimal-task".to_string(),
        description: None,
        schema: None,
        max_retries: 0,
        timeout_ms: None,
    };
    let json = serde_json::to_string(&task).unwrap();
    let deserialized: TaskDefinition = serde_json::from_str(&json).unwrap();
    assert_eq!(task.name, deserialized.name);
    assert!(deserialized.description.is_none());
    assert!(deserialized.schema.is_none());
    assert!(deserialized.timeout_ms.is_none());
    assert_eq!(deserialized.max_retries, 0);
}
