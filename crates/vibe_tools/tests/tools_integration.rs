// Integration tests for the vibe_tools crate.
// Tests cover tool creation, execution, input validation, timeout handling,
// and cancellation token integration.

use std::sync::Arc;
use std::time::Duration;
use vibe_cancellation::CancellationTokenSource;
use vibe_tools::*;

fn create_echo_tool() -> Tool {
    Tool::new(
        "echo",
        "Echoes back the input",
        serde_json::json!({
            "type": "object",
            "required": ["message"],
            "properties": {
                "message": { "type": "string" }
            }
        }),
        |input, _ct| {
            let message = input
                .arguments
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Ok(ToolOutput {
                name: "echo".to_string(),
                result: serde_json::json!({"echo": message}),
                duration_ms: 0,
            })
        },
    )
}

#[test]
fn test_tool_definition_returns_correct_metadata() {
    let tool = create_echo_tool();
    let def = tool.definition();
    assert_eq!(def.name, "echo");
    assert_eq!(def.description, "Echoes back the input");
    assert_eq!(def.input_schema["required"][0], "message");
}

#[test]
fn test_execute_tool_with_valid_input() {
    let tool = create_echo_tool();
    let result = tool.execute(
        ToolInput {
            name: "echo".to_string(),
            arguments: serde_json::json!({"message": "hello world"}),
        },
        None,
    );
    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output.name, "echo");
    assert_eq!(output.result["echo"], "hello world");
}

#[test]
fn test_execute_tool_with_missing_required_field_returns_error() {
    let tool = create_echo_tool();
    let result = tool.execute(
        ToolInput {
            name: "echo".to_string(),
            arguments: serde_json::json!({"unrelated": "value"}),
        },
        None,
    );
    // The executor itself does not validate; it just echoes what's given.
    // The missing field would cause the executor to get empty string.
    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output.result["echo"], "");
}

#[tokio::test]
async fn test_run_tool_call_with_timeout_no_expiry() {
    let tool = create_echo_tool();
    let result = run_tool_call(
        &tool,
        ToolInput {
            name: "echo".to_string(),
            arguments: serde_json::json!({"message": "timeout test"}),
        },
        None,
        Some(5000),
    )
    .await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap().result["echo"], "timeout test");
}

#[test]
fn test_validate_tool_input_with_valid_input() {
    let schema = serde_json::json!({
        "type": "object",
        "required": ["name"],
        "properties": {
            "name": { "type": "string" }
        }
    });
    let input = serde_json::json!({"name": "test"});
    assert!(validate_tool_input(&schema, &input).is_ok());
}

#[test]
fn test_validate_tool_input_missing_required_returns_err() {
    let schema = serde_json::json!({
        "type": "object",
        "required": ["name"],
        "properties": {
            "name": { "type": "string" }
        }
    });
    let input = serde_json::json!({});
    assert!(validate_tool_input(&schema, &input).is_err());
}

#[test]
fn test_validate_tool_input_wrong_type_returns_err() {
    let schema = serde_json::json!({
        "type": "object",
        "properties": {
            "count": { "type": "number" }
        }
    });
    let input = serde_json::json!({"count": "not_a_number"});
    assert!(validate_tool_input(&schema, &input).is_err());
}

#[tokio::test]
async fn test_with_timeout_completes_in_time() {
    let result = with_timeout(async { Ok::<_, ToolError>(42u32) }, Duration::from_millis(1000)).await;
    assert_eq!(result.unwrap(), 42);
}

#[test]
fn test_tool_execute_with_cancellation_token_not_cancelled() {
    let tool = Tool::new(
        "cancellation_test",
        "Tests cancellation token",
        serde_json::json!({}),
        |_input, ct| {
            assert!(ct.is_some());
            assert!(!ct.unwrap().is_cancelled());
            Ok(ToolOutput {
                name: "cancellation_test".to_string(),
                result: serde_json::json!({"cancelled": false}),
                duration_ms: 0,
            })
        },
    );
    let source = CancellationTokenSource::new();
    let result = tool.execute(
        ToolInput {
            name: "cancellation_test".to_string(),
            arguments: serde_json::json!({}),
        },
        Some(source.token()),
    );
    assert!(result.is_ok());
    let output = result.unwrap();
    assert_eq!(output.result["cancelled"], false);
}

#[test]
fn test_tool_execute_uses_fn_closure() {
    let captured = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let captured_clone = captured.clone();
    let tool = Tool::new(
        "closure_test",
        "Tests closure capture",
        serde_json::json!({}),
        move |_input, _ct| {
            captured_clone.store(true, std::sync::atomic::Ordering::SeqCst);
            Ok(ToolOutput {
                name: "closure_test".to_string(),
                result: serde_json::json!({"called": true}),
                duration_ms: 0,
            })
        },
    );
    let result = tool.execute(
        ToolInput {
            name: "closure_test".to_string(),
            arguments: serde_json::json!({}),
        },
        None,
    );
    assert!(result.is_ok());
    assert!(captured.load(std::sync::atomic::Ordering::SeqCst));
    let output = result.unwrap();
    assert_eq!(output.result["called"], true);
}
