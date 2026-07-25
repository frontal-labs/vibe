// Integration tests for the vibe_scheduler crate.
// Tests cover task registration, scheduling, priority ordering, FIFO ordering,
// unregistration, queue management, and blocking dequeue with notification.

use std::sync::Arc;
use std::time::Duration;
use vibe_cancellation::CancellationToken;
use vibe_scheduler::*;
use vibe_shared::{ExecutionId, TaskDefinition, TaskId};

fn create_task_def(task_id: TaskId) -> TaskDefinition {
    TaskDefinition {
        task_id,
        name: "test".to_string(),
        description: None,
        schema: None,
        max_retries: 3,
        timeout_ms: None,
    }
}

#[tokio::test]
async fn test_register_schedule_dequeue() {
    let scheduler = Scheduler::new(CancellationToken::new());
    let task_id = TaskId::new();
    scheduler
        .register_task(create_task_def(task_id))
        .unwrap();

    let scheduled = scheduler
        .schedule(task_id, Priority::Normal, None)
        .await
        .unwrap();
    assert_eq!(scheduled.task_id, task_id);

    let dequeued = scheduler.dequeue().await;
    assert!(dequeued.is_some());
    assert_eq!(dequeued.unwrap().task_id, task_id);
}

#[tokio::test]
async fn test_highest_priority_dequeued_first() {
    let scheduler = Scheduler::new(CancellationToken::new());
    let task_id = TaskId::new();
    scheduler
        .register_task(create_task_def(task_id))
        .unwrap();

    scheduler
        .schedule(task_id, Priority::Low, None)
        .await
        .unwrap();
    scheduler
        .schedule(task_id, Priority::Critical, None)
        .await
        .unwrap();
    scheduler
        .schedule(task_id, Priority::High, None)
        .await
        .unwrap();
    scheduler
        .schedule(task_id, Priority::Normal, None)
        .await
        .unwrap();

    let first = scheduler.dequeue().await.unwrap();
    assert!(matches!(first.priority, Priority::Critical));
    let second = scheduler.dequeue().await.unwrap();
    assert!(matches!(second.priority, Priority::High));
    let third = scheduler.dequeue().await.unwrap();
    assert!(matches!(third.priority, Priority::Normal));
    let fourth = scheduler.dequeue().await.unwrap();
    assert!(matches!(fourth.priority, Priority::Low));
}

#[test]
fn test_same_priority_fifo_order() {
    let mut queue = TaskQueue::new();
    let id1 = ExecutionId::new();
    let id2 = ExecutionId::new();
    let id3 = ExecutionId::new();

    queue.enqueue(ScheduledTask {
        task_id: TaskId::new(),
        execution_id: id1,
        priority: Priority::Normal,
        created_at: 100,
        scheduled_at: None,
        max_retries: 3,
        timeout_ms: None,
    });
    queue.enqueue(ScheduledTask {
        task_id: TaskId::new(),
        execution_id: id2,
        priority: Priority::Normal,
        created_at: 200,
        scheduled_at: None,
        max_retries: 3,
        timeout_ms: None,
    });
    queue.enqueue(ScheduledTask {
        task_id: TaskId::new(),
        execution_id: id3,
        priority: Priority::Normal,
        created_at: 300,
        scheduled_at: None,
        max_retries: 3,
        timeout_ms: None,
    });

    assert_eq!(queue.dequeue().unwrap().execution_id, id1);
    assert_eq!(queue.dequeue().unwrap().execution_id, id2);
    assert_eq!(queue.dequeue().unwrap().execution_id, id3);
}

#[tokio::test]
async fn test_schedule_unregistered_task_returns_error() {
    let scheduler = Scheduler::new(CancellationToken::new());
    let task_id = TaskId::new();
    let result = scheduler.schedule(task_id, Priority::Normal, None).await;
    assert!(matches!(result, Err(SchedulerError::TaskNotFound(_))));
}

#[test]
fn test_has_task_returns_correct_state() {
    let scheduler = Scheduler::new(CancellationToken::new());
    let task_id = TaskId::new();
    assert!(!scheduler.has_task(&task_id));

    scheduler
        .register_task(create_task_def(task_id))
        .unwrap();
    assert!(scheduler.has_task(&task_id));

    scheduler.unregister_task(task_id).unwrap();
    assert!(!scheduler.has_task(&task_id));
}

#[tokio::test]
async fn test_queue_len_tracks_enqueue_dequeue() {
    let scheduler = Scheduler::new(CancellationToken::new());
    assert_eq!(scheduler.queue_len(), 0);

    let task_id = TaskId::new();
    scheduler
        .register_task(create_task_def(task_id))
        .unwrap();

    scheduler
        .schedule(task_id, Priority::Normal, None)
        .await
        .unwrap();
    assert_eq!(scheduler.queue_len(), 1);

    scheduler
        .schedule(task_id, Priority::High, None)
        .await
        .unwrap();
    assert_eq!(scheduler.queue_len(), 2);

    scheduler.dequeue().await;
    assert_eq!(scheduler.queue_len(), 1);

    scheduler.dequeue().await;
    assert_eq!(scheduler.queue_len(), 0);
}

#[test]
fn test_dequeue_empty_queue_returns_none() {
    let mut queue = TaskQueue::new();
    assert!(queue.dequeue().is_none());
    assert!(queue.is_empty());
}

#[tokio::test]
async fn test_dequeue_or_wait_blocks_until_task_available() {
    let scheduler = Arc::new(Scheduler::new(CancellationToken::new()));
    let task_id = TaskId::new();
    scheduler
        .register_task(create_task_def(task_id))
        .unwrap();

    let sched_clone = scheduler.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(100)).await;
        sched_clone
            .schedule(task_id, Priority::Normal, None)
            .await
            .unwrap();
    });

    let task = scheduler.dequeue_or_wait(None).await;
    assert!(task.is_some());
    assert_eq!(task.unwrap().task_id, task_id);
}

#[tokio::test]
async fn test_task_queue_notifies_on_enqueue() {
    let mut queue = TaskQueue::new();
    let notify = queue.notify();

    let notify_clone = notify.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(50)).await;
        queue.enqueue(ScheduledTask {
            task_id: TaskId::new(),
            execution_id: ExecutionId::new(),
            priority: Priority::Normal,
            created_at: 1,
            scheduled_at: None,
            max_retries: 3,
            timeout_ms: None,
        });
    });

    tokio::time::timeout(Duration::from_secs(1), notify_clone.notified())
        .await
        .expect("Notification should fire within timeout");
}
