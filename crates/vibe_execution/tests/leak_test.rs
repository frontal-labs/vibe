use vibe_execution::ExecutionEngine;
use vibe_shared::{TaskDefinition, TaskId};

#[test]
fn test_10k_concurrent_executions() {
    let engine = ExecutionEngine::new();
    let task_id = TaskId::new();

    engine
        .register_task(TaskDefinition {
            task_id,
            name: "leak_test".to_string(),
            description: None,
            schema: None,
            max_retries: 1,
            timeout_ms: Some(100),
        })
        .unwrap();

    let rt = tokio::runtime::Runtime::new().unwrap();

    rt.block_on(async {
        let mut handles = Vec::with_capacity(10_000);

        for _ in 0..10_000 {
            let handle = engine.execute(task_id, serde_json::json!({"seq": "test"}));
            handles.push(handle);
        }

        for handle in handles {
            let result = handle.await;
            assert!(result.is_ok(), "Execution should succeed");
        }
    });

    let active = engine.active_executions();
    assert!(
        active.is_empty(),
        "All executions should be completed, got {} active",
        active.len()
    );
}
