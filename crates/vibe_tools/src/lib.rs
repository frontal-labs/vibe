use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::timeout;
use tracing::{debug, warn};
use vibe_cancellation::CancellationToken;
use vibe_errors::VibeError;

pub type ToolSchema = serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInput {
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolOutput {
    pub name: String,
    pub result: serde_json::Value,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolError {
    pub message: String,
    pub code: String,
}

impl std::fmt::Display for ToolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for ToolError {}

pub type ToolResult = Result<ToolOutput, ToolError>;

#[derive(Clone)]
pub struct Tool {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
    executor: Arc<dyn Fn(ToolInput, Option<CancellationToken>) -> ToolResult + Send + Sync>,
}

impl Tool {
    pub fn new<F>(name: &str, description: &str, input_schema: serde_json::Value, executor: F) -> Self
    where
        F: Fn(ToolInput, Option<CancellationToken>) -> ToolResult + Send + Sync + 'static,
    {
        Self {
            name: name.to_string(),
            description: description.to_string(),
            input_schema,
            executor: Arc::new(executor),
        }
    }

    pub fn execute(
        &self,
        input: ToolInput,
        cancellation_token: Option<CancellationToken>,
    ) -> ToolResult {
        (self.executor)(input, cancellation_token)
    }

    pub fn definition(&self) -> ToolDefinition {
        ToolDefinition {
            name: self.name.clone(),
            description: self.description.clone(),
            input_schema: self.input_schema.clone(),
        }
    }
}

pub fn validate_tool_input(schema: &serde_json::Value, input: &serde_json::Value) -> Result<(), VibeError> {
    if let Some(required) = schema.get("required").and_then(|r| r.as_array()) {
        for field in required {
            let field_name = field.as_str().unwrap_or("");
            if input.get(field_name).is_none_or(|v| v.is_null()) {
                return Err(VibeError::ValidationError {
                    message: format!("Missing required field: {}", field_name),
                    field: Some(field_name.to_string()),
                });
            }
        }
    }

    if let Some(properties) = schema.get("properties").and_then(|p| p.as_object()) {
        for (key, prop_schema) in properties {
            if let Some(value) = input.get(key) {
                if let Some(prop_type) = prop_schema.get("type").and_then(|t| t.as_str()) {
                    let valid = match prop_type {
                        "string" => value.is_string(),
                        "number" | "integer" => value.is_number(),
                        "boolean" => value.is_boolean(),
                        "array" => value.is_array(),
                        "object" => value.is_object(),
                        _ => true,
                    };
                    if !valid {
                        return Err(VibeError::ValidationError {
                            message: format!("Field '{}' expected type '{}'", key, prop_type),
                            field: Some(key.to_string()),
                        });
                    }
                }
            }
        }
    }

    Ok(())
}

pub async fn run_tool_call(
    tool: &Tool,
    input: ToolInput,
    cancellation_token: Option<CancellationToken>,
    timeout_ms: Option<u64>,
) -> ToolResult {
    validate_tool_input(&tool.input_schema, &input.arguments)
        .map_err(|e| ToolError {
            message: e.to_string(),
            code: "VALIDATION_ERROR".to_string(),
        })?;

    debug!(tool = %tool.name, "Executing tool");

    let result = if let Some(duration) = timeout_ms {
        let cloned_tool = tool.clone();
        let input_clone = input.clone();
        let ct = cancellation_token.clone();
        let tool_name = tool.name.clone();
        match timeout(Duration::from_millis(duration), tokio::task::spawn_blocking(move || {
            cloned_tool.execute(input_clone, ct)
        }))
        .await
        {
            Ok(Ok(Ok(output))) => Ok(output),
            Ok(Ok(Err(e))) => Err(e),
            Ok(Err(e)) => Err(ToolError {
                message: format!("Tool execution panicked: {}", e),
                code: "PANIC_ERROR".to_string(),
            }),
            Err(_) => Err(ToolError {
                message: format!("Tool '{}' timed out after {}ms", tool_name, duration),
                code: "TIMEOUT_ERROR".to_string(),
            }),
        }
    } else {
        tool.execute(input, cancellation_token)
    };

    match &result {
        Ok(output) => {
            debug!(tool = %tool.name, duration_ms = output.duration_ms, "Tool completed");
        }
        Err(e) => {
            warn!(tool = %tool.name, error = %e, "Tool execution failed");
        }
    }

    result
}

pub async fn with_timeout<F, T>(
    operation: F,
    duration: Duration,
) -> Result<T, ToolError>
where
    F: std::future::Future<Output = Result<T, ToolError>>,
{
    match tokio::time::timeout(duration, operation).await {
        Ok(result) => result,
        Err(_) => Err(ToolError {
            message: format!("Operation timed out after {}ms", duration.as_millis()),
            code: "TIMEOUT_ERROR".to_string(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_tool() -> Tool {
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
                let message = input.arguments.get("message").and_then(|v| v.as_str()).unwrap_or("").to_string();
                Ok(ToolOutput {
                    name: "echo".to_string(),
                    result: serde_json::json!({ "echo": message }),
                    duration_ms: 0,
                })
            },
        )
    }

    #[test]
    fn test_tool_definition() {
        let tool = create_test_tool();
        let def = tool.definition();
        assert_eq!(def.name, "echo");
        assert_eq!(def.description, "Echoes back the input");
    }

    #[test]
    fn test_tool_execute_success() {
        let tool = create_test_tool();
        let result = tool.execute(
            ToolInput {
                name: "echo".to_string(),
                arguments: serde_json::json!({"message": "hello"}),
            },
            None,
        );
        assert!(result.is_ok());
        assert_eq!(
            result.unwrap().result,
            serde_json::json!({"echo": "hello"})
        );
    }

    #[test]
    fn test_validate_tool_input_valid() {
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
    fn test_validate_tool_input_missing_required() {
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
    fn test_validate_tool_input_wrong_type() {
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
    async fn test_run_tool_call_with_timeout() {
        let tool = Tool::new(
            "slow",
            "Slow tool",
            serde_json::json!({}),
            |_input, _ct| {
                std::thread::sleep(Duration::from_millis(50));
                Ok(ToolOutput {
                    name: "slow".to_string(),
                    result: serde_json::json!({"done": true}),
                    duration_ms: 50,
                })
            },
        );

        let result = run_tool_call(
            &tool,
            ToolInput {
                name: "slow".to_string(),
                arguments: serde_json::json!({}),
            },
            None,
            Some(5000),
        )
        .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_run_tool_call_invalid_input() {
        let tool = create_test_tool();
        let result = run_tool_call(
            &tool,
            ToolInput {
                name: "echo".to_string(),
                arguments: serde_json::json!({}),
            },
            None,
            None,
        )
        .await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, "VALIDATION_ERROR");
    }

    #[test]
    fn test_tool_error_display() {
        let err = ToolError {
            message: "something went wrong".to_string(),
            code: "ERR_TEST".to_string(),
        };
        assert_eq!(err.to_string(), "[ERR_TEST] something went wrong");
    }
}
