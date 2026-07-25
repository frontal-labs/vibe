use napi_derive::napi;
use std::sync::Arc;
use vibe_cancellation as cancellation;
use vibe_errors as errors;
use vibe_execution as execution;
use vibe_retry as retry;
use vibe_scheduler as scheduler;
use vibe_shared as shared;
use vibe_tools as tools;

pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[napi]
pub fn get_version() -> String {
    version().to_string()
}

// ====== Shared Types ======

#[napi]
pub fn generate_execution_id() -> String {
    shared::ExecutionId::new().to_string()
}

#[napi]
pub fn generate_task_id() -> String {
    shared::TaskId::new().to_string()
}

#[napi]
pub fn generate_checkpoint_id() -> String {
    shared::CheckpointId::new().to_string()
}

// ====== Cancellation ======

#[napi]
pub struct JsCancellationToken {
    inner: cancellation::CancellationToken,
}

#[napi]
impl JsCancellationToken {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            inner: cancellation::CancellationToken::new(),
        }
    }

    #[napi]
    pub fn is_cancelled(&self) -> bool {
        self.inner.is_cancelled()
    }

    #[napi]
    pub fn child_token(&self) -> Self {
        Self {
            inner: self.inner.child_token(),
        }
    }
}

impl Default for JsCancellationToken {
    fn default() -> Self {
        Self::new()
    }
}

#[napi]
pub struct JsCancellationTokenSource {
    inner: cancellation::CancellationTokenSource,
}

#[napi]
impl JsCancellationTokenSource {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            inner: cancellation::CancellationTokenSource::new(),
        }
    }

    #[napi]
    pub fn token(&self) -> JsCancellationToken {
        JsCancellationToken {
            inner: self.inner.token(),
        }
    }

    #[napi]
    pub fn cancel(&self) {
        self.inner.cancel();
    }
}

impl Default for JsCancellationTokenSource {
    fn default() -> Self {
        Self::new()
    }
}

// ====== Retry ======

#[napi]
pub fn default_retry_policy() -> JsRetryPolicy {
    JsRetryPolicy {
        inner: retry::default_retry_policy(),
    }
}

#[napi]
pub fn calculate_backoff(attempt: u32, policy: &JsRetryPolicy) -> i64 {
    retry::calculate_backoff(attempt, &policy.inner).as_millis() as i64
}

#[napi]
pub struct JsRetryPolicy {
    inner: shared::RetryPolicy,
}

#[napi]
impl JsRetryPolicy {
    #[napi(constructor)]
    pub fn new(max_attempts: u32, base_delay_ms: i64, max_delay_ms: i64, backoff_multiplier: f64) -> Self {
        Self {
            inner: shared::RetryPolicy {
                max_attempts,
                base_delay_ms: base_delay_ms as u64,
                max_delay_ms: max_delay_ms as u64,
                backoff_multiplier,
                retryable_errors: Vec::new(),
            },
        }
    }

    #[napi(getter)]
    pub fn max_attempts(&self) -> u32 {
        self.inner.max_attempts
    }

    #[napi(getter)]
    pub fn base_delay_ms(&self) -> i64 {
        self.inner.base_delay_ms as i64
    }

    #[napi(getter)]
    pub fn max_delay_ms(&self) -> i64 {
        self.inner.max_delay_ms as i64
    }

    #[napi(getter)]
    pub fn backoff_multiplier(&self) -> f64 {
        self.inner.backoff_multiplier
    }
}

// ====== Scheduler ======

#[napi]
pub struct JsScheduler {
    inner: Arc<scheduler::Scheduler>,
}

#[napi]
impl JsScheduler {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            inner: Arc::new(scheduler::Scheduler::new(cancellation::CancellationToken::new())),
        }
    }

    #[napi]
    pub fn register_task(&self, task_id: String, name: String, description: Option<String>, max_retries: u32, timeout_ms: Option<i64>) -> napi::Result<()> {
        let tid = shared::TaskId::from_string(&task_id).map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let task = shared::TaskDefinition {
            task_id: tid,
            name,
            description,
            schema: None,
            max_retries,
            timeout_ms: timeout_ms.map(|v| v as u64),
        };
        self.inner.register_task(task).map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    #[napi]
    pub fn has_task(&self, task_id: String) -> bool {
        if let Ok(tid) = shared::TaskId::from_string(&task_id) {
            self.inner.has_task(&tid)
        } else {
            false
        }
    }

    #[napi]
    pub fn unregister_task(&self, task_id: String) -> napi::Result<()> {
        let tid = shared::TaskId::from_string(&task_id).map_err(|e| napi::Error::from_reason(e.to_string()))?;
        self.inner.unregister_task(tid).map_err(|e| napi::Error::from_reason(e.to_string()))
    }
}

impl Default for JsScheduler {
    fn default() -> Self {
        Self::new()
    }
}

// ====== Execution Engine ======

// ====== Execution Engine ======

#[napi]
pub struct JsExecutionEngine {
    inner: Arc<execution::ExecutionEngine>,
}

#[napi]
impl JsExecutionEngine {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            inner: Arc::new(execution::ExecutionEngine::new()),
        }
    }

    #[napi]
    pub fn register_task(&self, task_id: String, name: String, description: Option<String>, max_retries: u32, timeout_ms: Option<i64>) -> napi::Result<()> {
        let tid = shared::TaskId::from_string(&task_id).map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let task = shared::TaskDefinition {
            task_id: tid,
            name,
            description,
            schema: None,
            max_retries,
            timeout_ms: timeout_ms.map(|v| v as u64),
        };
        self.inner.register_task(task).map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    #[napi]
    pub async fn execute(&self, task_id: String, input_json: String) -> napi::Result<JsExecutionResult> {
        let tid = shared::TaskId::from_string(&task_id).map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let input: serde_json::Value = serde_json::from_str(&input_json)
            .map_err(|e| napi::Error::from_reason(format!("Invalid JSON input: {}", e)))?;
        let result = self.inner.execute(tid, input).await
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        Ok(JsExecutionResult { inner: result })
    }

    #[napi]
    pub fn cancel(&self, execution_id: String) -> napi::Result<()> {
        let eid = shared::ExecutionId::from_string(&execution_id)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        self.inner.cancel(eid).map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    #[napi]
    pub fn get_execution_state(&self, execution_id: String) -> napi::Result<String> {
        let eid = shared::ExecutionId::from_string(&execution_id)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        let ctx = self.inner.get_execution(&eid)
            .ok_or_else(|| napi::Error::from_reason(format!("Execution {} not found", execution_id)))?;
        serde_json::to_string(&ctx).map_err(|e| napi::Error::from_reason(e.to_string()))
    }
}

impl Default for JsExecutionEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[napi]
pub struct JsExecutionResult {
    inner: shared::ExecutionResult,
}

#[napi]
impl JsExecutionResult {
    #[napi(getter)]
    pub fn execution_id(&self) -> String {
        self.inner.execution_id.to_string()
    }

    #[napi(getter)]
    pub fn state(&self) -> String {
        format!("{:?}", self.inner.state)
    }

    #[napi(getter)]
    pub fn output(&self) -> Option<String> {
        self.inner.output.as_ref().map(|v| v.to_string())
    }

    #[napi(getter)]
    pub fn error(&self) -> Option<String> {
        self.inner.error.clone()
    }
}

// ====== Tools ======

#[napi]
pub fn validate_tool_input(schema_json: String, input_json: String) -> napi::Result<()> {
    let schema: serde_json::Value = serde_json::from_str(&schema_json)
        .map_err(|e| napi::Error::from_reason(format!("Invalid schema JSON: {}", e)))?;
    let input: serde_json::Value = serde_json::from_str(&input_json)
        .map_err(|e| napi::Error::from_reason(format!("Invalid input JSON: {}", e)))?;
    tools::validate_tool_input(&schema, &input)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

// ====== Errors ======

#[napi]
pub fn serialize_error(message: String, code: String) -> String {
    let err = errors::VibeError::RuntimeError { message, code };
    let serialized = errors::serialize_error(&err);
    serde_json::to_string(&serialized).unwrap_or_else(|_| "{}".to_string())
}

// ====== Token Counting ======

#[napi]
pub fn count_tokens(text: String, model_family: String) -> u32 {
    vibe_model::count_tokens(&text, &model_family)
}

#[napi]
pub fn count_messages(messages_json: String, model_family: String) -> Vec<u32> {
    let messages: Vec<vibe_model::Message> = match serde_json::from_str(&messages_json) {
        Ok(msgs) => msgs,
        Err(_) => return vec![],
    };
    vibe_model::count_message_tokens(&messages, &model_family)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version_is_nonempty() {
        assert!(!version().is_empty());
    }

    #[test]
    fn test_generate_ids() {
        let eid = generate_execution_id();
        assert!(!eid.is_empty());
        let tid = generate_task_id();
        assert!(!tid.is_empty());
        let cid = generate_checkpoint_id();
        assert!(!cid.is_empty());
    }

    #[test]
    fn test_cancellation_token() {
        let source = JsCancellationTokenSource::new();
        let token = source.token();
        assert!(!token.is_cancelled());
        source.cancel();
        assert!(token.is_cancelled());
    }

    #[test]
    fn test_retry_policy_default() {
        let policy = default_retry_policy();
        assert_eq!(policy.max_attempts(), 3);
        assert_eq!(policy.base_delay_ms(), 1000);
    }

    #[test]
    fn test_calculate_backoff() {
        let policy = default_retry_policy();
        let delay = calculate_backoff(1, &policy);
        assert!(delay > 0);
    }

    #[test]
    fn test_count_tokens_basic() {
        let count = count_tokens("Hello, world!".to_string(), "heuristic".to_string());
        assert!(count > 0);
    }

    #[test]
    fn test_serialize_error() {
        let result = serialize_error("test error".to_string(), "ERR_TEST".to_string());
        assert!(result.contains("test error"));
    }

    #[test]
    fn test_validate_tool_input_valid() {
        let schema = r#"{"type":"object","required":["name"],"properties":{"name":{"type":"string"}}}"#.to_string();
        let input = r#"{"name":"test"}"#.to_string();
        assert!(validate_tool_input(schema, input).is_ok());
    }

    #[test]
    fn test_validate_tool_input_invalid() {
        let schema = r#"{"type":"object","required":["name"],"properties":{"name":{"type":"string"}}}"#.to_string();
        let input = r#"{}"#.to_string();
        assert!(validate_tool_input(schema, input).is_err());
    }
}
