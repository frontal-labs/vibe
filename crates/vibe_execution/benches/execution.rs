use criterion::{black_box, criterion_group, criterion_main, Criterion};
use vibe_execution::ExecutionEngine;
use vibe_shared::{TaskDefinition, TaskId};

fn bench_execute(c: &mut Criterion) {
    let rt = tokio::runtime::Runtime::new().unwrap();

    c.bench_function("execution_engine_execute", |b| {
        b.iter_custom(|iters| {
            let engine = ExecutionEngine::new();
            let task_id = TaskId::new();
            engine
                .register_task(TaskDefinition {
                    task_id,
                    name: "bench".to_string(),
                    description: None,
                    schema: None,
                    max_retries: 3,
                    timeout_ms: Some(5000),
                })
                .unwrap();

            let start = std::time::Instant::now();
            rt.block_on(async move {
                for _ in 0..iters {
                    let result = engine
                        .execute(black_box(task_id), black_box(serde_json::json!({"input": "bench"})))
                        .await;
                    let _ = black_box(result);
                }
            });
            start.elapsed()
        });
    });
}

criterion_group!(benches, bench_execute);
criterion_main!(benches);
