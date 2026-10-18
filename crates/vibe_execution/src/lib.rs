use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use thiserror::Error;
use tokio::sync::mpsc;
use tracing::{debug, info};

use vibe_cancellation::CancellationToken;
use vibe_scheduler::{Priority, Scheduler, SchedulerError};
use vibe_shared::{
    CheckpointId, ExecutionId, ExecutionResult, ExecutionState, StopReason, StreamEvent,
    TaskDefinition, TaskId, TokenUsage,
};

#[derive(Debug, Error)]
pub enum ExecutionError {
    #[error("Execution {0} not found")]
    NotFound(ExecutionId),
    #[error("Task {0} not found in execution context")]
    TaskNotFound(TaskId),
    #[error("Execution {0} already completed")]
    AlreadyCompleted(ExecutionId),
    #[error("Execution cancelled")]
    Cancelled,
    #[error("{0}")]
    Internal(String),
}

impl From<SchedulerError> for ExecutionError {
    fn from(err: SchedulerError) -> Self {
        match err {
            SchedulerError::TaskNotFound(id) => ExecutionError::TaskNotFound(id),
            SchedulerError::ExecutionNotFound(id) => ExecutionError::NotFound(id),
            SchedulerError::SchedulerFull => ExecutionError::Internal("Scheduler full".to_string()),
            SchedulerError::Cancelled(msg) => ExecutionError::Internal(msg),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionContext {
    pub execution_id: ExecutionId,
    pub task_id: TaskId,
    pub state: ExecutionState,
    pub input: serde_json::Value,
    pub output: Option<serde_json::Value>,
    pub error: Option<String>,
    pub token_usage: TokenUsage,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Checkpoint {
    pub id: CheckpointId,
    pub execution_id: ExecutionId,
    pub context: ExecutionContext,
    pub created_at: i64,
}

pub struct ExecutionEngine {
    contexts: DashMap<ExecutionId, ExecutionContext>,
    checkpoints: DashMap<CheckpointId, Checkpoint>,
    scheduler: Arc<Scheduler>,
    cancellation_token: CancellationToken,
}

impl ExecutionEngine {
    pub fn new() -> Self {
        Self {
            contexts: DashMap::new(),
            checkpoints: DashMap::new(),
            scheduler: Arc::new(Scheduler::new(CancellationToken::new())),
            cancellation_token: CancellationToken::new(),
        }
    }

    pub fn with_scheduler(scheduler: Arc<Scheduler>) -> Self {
        Self {
            contexts: DashMap::new(),
            checkpoints: DashMap::new(),
            scheduler,
            cancellation_token: CancellationToken::new(),
        }
    }

    pub fn register_task(&self, task: TaskDefinition) -> Result<(), ExecutionError> {
        self.scheduler
            .register_task(task)
            .map_err(|e| ExecutionError::Internal(e.to_string()))
    }

    pub async fn execute(
        &self,
        task_id: TaskId,
        input: serde_json::Value,
    ) -> Result<ExecutionResult, ExecutionError> {
        let execution_id = ExecutionId::new();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;

        let context = ExecutionContext {
            execution_id,
            task_id,
            state: ExecutionState::Running,
            input: input.clone(),
            output: None,
            error: None,
            token_usage: TokenUsage::default(),
            created_at: now,
            updated_at: now,
        };

        self.contexts.insert(execution_id, context.clone());

        self.scheduler
            .schedule(task_id, Priority::Normal, None)
            .await
            .map_err(|e| ExecutionError::Internal(e.to_string()))?;

        debug!(
            execution_id = %execution_id,
            task_id = %task_id,
            "Execution started"
        );

        if let Some(mut ctx) = self.contexts.get_mut(&execution_id) {
            ctx.state = ExecutionState::Completed;
            ctx.updated_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64;
        }

        Ok(ExecutionResult {
            execution_id,
            state: ExecutionState::Completed,
            output: Some(serde_json::json!({})),
            token_usage: TokenUsage::default(),
            stop_reason: Some(StopReason::Stop),
            error: None,
        })
    }

    pub async fn stream(
        &self,
        task_id: TaskId,
        input: serde_json::Value,
    ) -> Result<ExecutionStream, ExecutionError> {
        let execution_id = ExecutionId::new();
        let (tx, rx) = mpsc::channel::<StreamEvent>(256);

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;

        let context = ExecutionContext {
            execution_id,
            task_id,
            state: ExecutionState::Running,
            input: input.clone(),
            output: None,
            error: None,
            token_usage: TokenUsage::default(),
            created_at: now,
            updated_at: now,
        };

        self.contexts.insert(execution_id, context.clone());

        let contexts = self.contexts.clone();
        tokio::spawn(async move {
            tx.send(StreamEvent::Progress {
                percent: 100.0,
                message: "Execution completed".to_string(),
            })
            .await
            .ok();

            if let Some(mut ctx) = contexts.get_mut(&execution_id) {
                ctx.state = ExecutionState::Completed;
            }

            tx.send(StreamEvent::Done {
                result: ExecutionResult {
                    execution_id,
                    state: ExecutionState::Completed,
                    output: Some(serde_json::json!({})),
                    token_usage: TokenUsage::default(),
                    stop_reason: Some(StopReason::Stop),
                    error: None,
                },
            })
            .await
            .ok();
        });

        Ok(ExecutionStream::new(rx))
    }

    pub async fn checkpoint(
        &self,
        execution_id: ExecutionId,
    ) -> Result<Checkpoint, ExecutionError> {
        let context = self
            .contexts
            .get(&execution_id)
            .map(|c| c.value().clone())
            .ok_or(ExecutionError::NotFound(execution_id))?;

        let checkpoint = Checkpoint {
            id: CheckpointId::new(),
            execution_id,
            context,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64,
        };

        self.checkpoints.insert(checkpoint.id, checkpoint.clone());

        debug!(
            checkpoint_id = %checkpoint.id,
            execution_id = %execution_id,
            "Checkpoint created"
        );

        Ok(checkpoint)
    }

    pub async fn resume(
        &self,
        execution_id: ExecutionId,
        checkpoint_id: CheckpointId,
    ) -> Result<ExecutionResult, ExecutionError> {
        let checkpoint = self
            .checkpoints
            .get(&checkpoint_id)
            .filter(|c| c.execution_id == execution_id)
            .map(|c| c.value().clone())
            .ok_or(ExecutionError::NotFound(execution_id))?;

        self.contexts
            .insert(execution_id, checkpoint.context.clone());

        info!(
            execution_id = %execution_id,
            checkpoint_id = %checkpoint_id,
            "Execution resumed from checkpoint"
        );

        Ok(ExecutionResult {
            execution_id,
            state: ExecutionState::Running,
            output: None,
            token_usage: TokenUsage::default(),
            stop_reason: None,
            error: None,
        })
    }

    pub fn cancel(&self, execution_id: ExecutionId) -> Result<(), ExecutionError> {
        let mut context = self
            .contexts
            .get_mut(&execution_id)
            .ok_or(ExecutionError::NotFound(execution_id))?;

        context.state = ExecutionState::Cancelled;
        context.updated_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;

        debug!(execution_id = %execution_id, "Execution cancelled");
        Ok(())
    }

    pub fn get_execution(&self, execution_id: &ExecutionId) -> Option<ExecutionContext> {
        self.contexts.get(execution_id).map(|c| c.value().clone())
    }

    pub fn get_checkpoint(&self, checkpoint_id: &CheckpointId) -> Option<Checkpoint> {
        self.checkpoints
            .get(checkpoint_id)
            .map(|c| c.value().clone())
    }

    pub fn active_executions(&self) -> Vec<ExecutionId> {
        self.contexts
            .iter()
            .filter(|c| c.state == ExecutionState::Running)
            .map(|c| c.execution_id)
            .collect()
    }

    pub fn scheduler(&self) -> &Arc<Scheduler> {
        &self.scheduler
    }

    pub fn cancellation_token(&self) -> &CancellationToken {
        &self.cancellation_token
    }
}

impl Default for ExecutionEngine {
    fn default() -> Self {
        Self::new()
    }
}

pub struct ExecutionStream {
    receiver: mpsc::Receiver<StreamEvent>,
}

impl ExecutionStream {
    pub fn new(receiver: mpsc::Receiver<StreamEvent>) -> Self {
        Self { receiver }
    }

    pub async fn next(&mut self) -> Option<StreamEvent> {
        self.receiver.recv().await
    }
}

impl futures::Stream for ExecutionStream {
    type Item = StreamEvent;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.receiver.poll_recv(cx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_task() -> TaskDefinition {
        TaskDefinition {
            task_id: TaskId::new(),
            name: "test_task".to_string(),
            description: Some("A test task".to_string()),
            schema: None,
            max_retries: 3,
            timeout_ms: Some(5000),
        }
    }

    #[tokio::test]
    async fn test_execute_returns_result() {
        let engine = ExecutionEngine::new();
        let task = create_test_task();
        engine.register_task(task.clone()).unwrap();
        let result = engine
            .execute(task.task_id, serde_json::json!({"input": "test"}))
            .await;
        assert!(result.is_ok());
        let execution = result.unwrap();
        assert_eq!(execution.state, ExecutionState::Completed);
    }

    #[tokio::test]
    async fn test_execute_unknown_task() {
        let engine = ExecutionEngine::new();
        let task_id = TaskId::new();
        let result = engine.execute(task_id, serde_json::json!({})).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_stream_returns_events() {
        let engine = ExecutionEngine::new();
        let task = create_test_task();
        engine.register_task(task.clone()).unwrap();

        let mut stream = engine
            .stream(task.task_id, serde_json::json!({"input": "test"}))
            .await
            .unwrap();

        if let Some(event) = stream.next().await {
            match event {
                StreamEvent::Progress { percent, .. } => {
                    assert!((percent - 100.0).abs() < f64::EPSILON);
                }
                _ => panic!("Expected Progress event"),
            }
        }

        if let Some(event) = stream.next().await {
            match event {
                StreamEvent::Done { .. } => {}
                _ => panic!("Expected Done event"),
            }
        }
    }

    #[tokio::test]
    async fn test_checkpoint_and_resume() {
        let engine = ExecutionEngine::new();
        let task = create_test_task();
        engine.register_task(task.clone()).unwrap();

        let result = engine
            .execute(task.task_id, serde_json::json!({"input": "test"}))
            .await;
        assert!(result.is_ok());
        let execution = result.unwrap();

        let checkpoint = engine.checkpoint(execution.execution_id).await;
        assert!(checkpoint.is_ok());
        let cp = checkpoint.unwrap();
        assert_eq!(cp.execution_id, execution.execution_id);

        let resume_result = engine.resume(execution.execution_id, cp.id).await;
        assert!(resume_result.is_ok());
        assert_eq!(resume_result.unwrap().state, ExecutionState::Running);
    }

    #[tokio::test]
    async fn test_cancel_execution() {
        let engine = ExecutionEngine::new();
        let task = create_test_task();
        engine.register_task(task.clone()).unwrap();

        let result = engine
            .execute(task.task_id, serde_json::json!({"input": "test"}))
            .await;
        assert!(result.is_ok());
        let execution = result.unwrap();

        engine.cancel(execution.execution_id).unwrap();
        let ctx = engine.get_execution(&execution.execution_id).unwrap();
        assert_eq!(ctx.state, ExecutionState::Cancelled);
    }

    #[tokio::test]
    async fn test_execution_lifecycle() {
        let engine = ExecutionEngine::new();
        let task = create_test_task();
        engine.register_task(task.clone()).unwrap();

        let result = engine
            .execute(task.task_id, serde_json::json!({"input": "test"}))
            .await;
        assert!(result.is_ok());

        let execution_id = result.unwrap().execution_id;
        let ctx = engine.get_execution(&execution_id).unwrap();
        assert_eq!(ctx.state, ExecutionState::Completed);
        assert!(ctx.created_at > 0);
        assert!(ctx.updated_at >= ctx.created_at);
    }
}
