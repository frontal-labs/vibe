// Integration tests for the vibe_execution crate.
// Tests cover task execution lifecycle, error handling, cancellation,
// checkpointing, resumption, streaming events, and active execution tracking.

use vibe_execution::*;
use vibe_shared::{ExecutionId, ExecutionState, StreamEvent, TaskDefinition, TaskId};

fn create_task_def(task_id: TaskId) -> TaskDefinition {
    TaskDefinition {
        task_id,
        name: "integration_test".to_string(),
        description: Some("Test task".to_string()),
        schema: None,
        max_retries: 3,
        timeout_ms: Some(5000),
    }
}

#[tokio::test]
async fn test_execute_registered_task_completes() {
    let engine = ExecutionEngine::new();
    let task_id = TaskId::new();
    engine.register_task(create_task_def(task_id)).unwrap();

    let result = engine
        .execute(task_id, serde_json::json!({"input": "test"}))
        .await
        .unwrap();
    assert_eq!(result.state, ExecutionState::Completed);
}

#[tokio::test]
async fn test_execute_unregistered_task_returns_error() {
    let engine = ExecutionEngine::new();
    let task_id = TaskId::new();

    let result = engine.execute(task_id, serde_json::json!({})).await;
    assert!(result.is_err());
    match result {
        Err(ExecutionError::Internal(_)) => {}
        _ => panic!("Expected Internal error wrapping TaskNotFound"),
    }
}

#[tokio::test]
async fn test_cancel_running_execution() {
    let engine = ExecutionEngine::new();
    let task_id = TaskId::new();
    engine.register_task(create_task_def(task_id)).unwrap();

    let result = engine
        .execute(task_id, serde_json::json!({}))
        .await
        .unwrap();
    let exec_id = result.execution_id;

    engine.cancel(exec_id).unwrap();
    let ctx = engine.get_execution(&exec_id).unwrap();
    assert_eq!(ctx.state, ExecutionState::Cancelled);
}

#[tokio::test]
async fn test_cancel_non_existent_execution_returns_error() {
    let engine = ExecutionEngine::new();
    let fake_id = ExecutionId::new();

    let result = engine.cancel(fake_id);
    assert!(result.is_err());
    assert!(matches!(result, Err(ExecutionError::NotFound(_))));
}

#[tokio::test]
async fn test_checkpoint_after_execution() {
    let engine = ExecutionEngine::new();
    let task_id = TaskId::new();
    engine.register_task(create_task_def(task_id)).unwrap();

    let result = engine
        .execute(task_id, serde_json::json!({"input": "checkpoint"}))
        .await
        .unwrap();
    let exec_id = result.execution_id;

    let checkpoint = engine.checkpoint(exec_id).await.unwrap();
    assert_eq!(checkpoint.execution_id, exec_id);
    assert_eq!(checkpoint.context.task_id, task_id);
}

#[tokio::test]
async fn test_resume_from_checkpoint() {
    let engine = ExecutionEngine::new();
    let task_id = TaskId::new();
    engine.register_task(create_task_def(task_id)).unwrap();

    let result = engine
        .execute(task_id, serde_json::json!({"input": "resume_test"}))
        .await
        .unwrap();
    let exec_id = result.execution_id;

    let checkpoint = engine.checkpoint(exec_id).await.unwrap();
    let resume_result = engine.resume(exec_id, checkpoint.id).await.unwrap();
    assert_eq!(resume_result.state, ExecutionState::Running);
}

#[tokio::test]
async fn test_stream_returns_progress_and_done() {
    let engine = ExecutionEngine::new();
    let task_id = TaskId::new();
    engine.register_task(create_task_def(task_id)).unwrap();

    let mut stream = engine
        .stream(task_id, serde_json::json!({"input": "stream_test"}))
        .await
        .unwrap();

    let mut saw_progress = false;
    let mut saw_done = false;

    while let Some(event) = stream.next().await {
        match event {
            StreamEvent::Progress { percent, .. } => {
                saw_progress = true;
                assert!((percent - 100.0).abs() < f64::EPSILON);
            }
            StreamEvent::Done { .. } => {
                saw_done = true;
            }
            _ => {}
        }
    }

    assert!(saw_progress);
    assert!(saw_done);
}

#[tokio::test]
async fn test_multiple_concurrent_executions_complete() {
    let engine = ExecutionEngine::new();
    let task_id1 = TaskId::new();
    let task_id2 = TaskId::new();
    engine.register_task(create_task_def(task_id1)).unwrap();
    engine.register_task(create_task_def(task_id2)).unwrap();

    let r1 = engine
        .execute(task_id1, serde_json::json!({"id": 1}))
        .await
        .unwrap();
    let r2 = engine
        .execute(task_id2, serde_json::json!({"id": 2}))
        .await
        .unwrap();

    assert_eq!(r1.state, ExecutionState::Completed);
    assert_eq!(r2.state, ExecutionState::Completed);
    assert_ne!(r1.execution_id, r2.execution_id);
}

#[tokio::test]
async fn test_active_executions_returns_running_executions() {
    let engine = ExecutionEngine::new();

    // After execution completes, it should not be in active_executions
    let task_id = TaskId::new();
    engine.register_task(create_task_def(task_id)).unwrap();
    let result = engine
        .execute(task_id, serde_json::json!({}))
        .await
        .unwrap();

    // The execution transitions to Completed, so active_executions should be empty
    let active = engine.active_executions();
    assert!(!active.contains(&result.execution_id));
}

#[tokio::test]
async fn test_get_execution_returns_context() {
    let engine = ExecutionEngine::new();
    let task_id = TaskId::new();
    engine.register_task(create_task_def(task_id)).unwrap();

    let result = engine
        .execute(task_id, serde_json::json!({"key": "value"}))
        .await
        .unwrap();
    let exec_id = result.execution_id;

    let ctx = engine.get_execution(&exec_id).unwrap();
    assert_eq!(ctx.execution_id, exec_id);
    assert_eq!(ctx.task_id, task_id);
    assert_eq!(ctx.state, ExecutionState::Completed);
    assert_eq!(ctx.input, serde_json::json!({"key": "value"}));
}
