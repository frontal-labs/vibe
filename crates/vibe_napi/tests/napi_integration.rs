// Integration tests for the vibe_napi crate.
// Tests cover ID generation, cancellation tokens, retry policies,
// token counting, error serialization, and tool input validation.
// Tests validate the underlying functions that the napi wrappers delegate to.

use vibe_cancellation::CancellationTokenSource;
use vibe_errors::{serialize_error, VibeError};
use vibe_model::count_tokens;
use vibe_retry::{calculate_backoff, default_retry_policy};
use vibe_shared::{CheckpointId, ExecutionId, TaskId};
use vibe_tools::validate_tool_input;

#[test]
fn test_version_returns_non_empty_string() {
    let v = env!("CARGO_PKG_VERSION");
    assert!(!v.is_empty());
    assert!(v.contains('.'));
}

#[test]
fn test_generate_execution_id_returns_non_empty() {
    let id = ExecutionId::new().to_string();
    assert!(!id.is_empty());
}

#[test]
fn test_generate_task_id_returns_unique_ids() {
    let id1 = TaskId::new().to_string();
    let id2 = TaskId::new().to_string();
    assert!(!id1.is_empty());
    assert!(!id2.is_empty());
    assert_ne!(id1, id2);
}

#[test]
fn test_generate_checkpoint_id_returns_unique_ids() {
    let id1 = CheckpointId::new().to_string();
    let id2 = CheckpointId::new().to_string();
    assert!(!id1.is_empty());
    assert!(!id2.is_empty());
    assert_ne!(id1, id2);
}

#[test]
fn test_cancellation_token_source_lifecycle() {
    let source = CancellationTokenSource::new();
    let token = source.token();
    assert!(!token.is_cancelled());
    source.cancel();
    assert!(token.is_cancelled());
}

#[test]
fn test_cancellation_token_reflects_source_state() {
    let source = CancellationTokenSource::new();
    let token = source.token();
    assert!(!token.is_cancelled());
    source.cancel();
    assert!(token.is_cancelled());

    let token2 = source.token();
    assert!(token2.is_cancelled());
}

#[test]
fn test_default_retry_policy_has_expected_defaults() {
    let policy = default_retry_policy();
    assert_eq!(policy.max_attempts, 3);
}

#[test]
fn test_calculate_backoff_with_default_policy_returns_positive() {
    let policy = default_retry_policy();
    let delay = calculate_backoff(1, &policy);
    assert!(delay.as_millis() > 0);
}

#[test]
fn test_count_tokens_basic_returns_positive_count() {
    let count = count_tokens("Hello, world!", "heuristic");
    assert!(count > 0);
}

#[test]
fn test_serialize_error_includes_message_and_code() {
    let err = VibeError::RuntimeError {
        message: "test error".to_string(),
        code: "ERR_TEST".to_string(),
    };
    let result = serialize_error(&err);
    assert_eq!(result.code, "ERR_TEST");
    assert!(result.message.contains("test error"));
}

#[test]
fn test_validate_tool_input_valid_returns_ok() {
    let schema = serde_json::json!({
        "type": "object",
        "required": ["name"],
        "properties": { "name": { "type": "string" } }
    });
    let input = serde_json::json!({"name": "test"});
    assert!(validate_tool_input(&schema, &input).is_ok());
}

#[test]
fn test_validate_tool_input_invalid_returns_err() {
    let schema = serde_json::json!({
        "type": "object",
        "required": ["name"],
        "properties": { "name": { "type": "string" } }
    });
    let input = serde_json::json!({});
    assert!(validate_tool_input(&schema, &input).is_err());
}
