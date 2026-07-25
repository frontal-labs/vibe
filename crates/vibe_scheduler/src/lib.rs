use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::BinaryHeap;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::Notify;
use tracing::debug;
use vibe_cancellation::CancellationToken;
use vibe_shared::{ExecutionId, TaskDefinition, TaskId};

pub type PriorityQueue = BinaryHeap<ScheduledTask>;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub enum Priority {
    Low,
    #[default]
    Normal,
    High,
    Critical,
}

impl Priority {
    fn as_u8(&self) -> u8 {
        match self {
            Priority::Low => 0,
            Priority::Normal => 1,
            Priority::High => 2,
            Priority::Critical => 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledTask {
    pub task_id: TaskId,
    pub execution_id: ExecutionId,
    pub priority: Priority,
    pub created_at: i64,
    pub scheduled_at: Option<i64>,
    pub max_retries: u32,
    pub timeout_ms: Option<u64>,
}

impl Eq for ScheduledTask {}

impl PartialEq for ScheduledTask {
    fn eq(&self, other: &Self) -> bool {
        self.execution_id == other.execution_id
    }
}

impl PartialOrd for ScheduledTask {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for ScheduledTask {
    fn cmp(&self, other: &Self) -> Ordering {
        self.priority
            .as_u8()
            .cmp(&other.priority.as_u8())
            .then_with(|| other.created_at.cmp(&self.created_at))
    }
}

#[derive(Debug, Error)]
pub enum SchedulerError {
    #[error("Task {0} not found")]
    TaskNotFound(TaskId),
    #[error("Execution {0} not found")]
    ExecutionNotFound(ExecutionId),
    #[error("Scheduler is full")]
    SchedulerFull,
    #[error("{0}")]
    Cancelled(String),
}

pub struct TaskQueue {
    queue: BinaryHeap<ScheduledTask>,
    notify: Arc<Notify>,
}

impl TaskQueue {
    pub fn new() -> Self {
        Self {
            queue: BinaryHeap::new(),
            notify: Arc::new(Notify::new()),
        }
    }

    pub fn enqueue(&mut self, task: ScheduledTask) {
        self.queue.push(task);
        self.notify.notify_one();
    }

    pub fn dequeue(&mut self) -> Option<ScheduledTask> {
        self.queue.pop()
    }

    pub fn peek(&self) -> Option<&ScheduledTask> {
        self.queue.peek()
    }

    pub fn len(&self) -> usize {
        self.queue.len()
    }

    pub fn is_empty(&self) -> bool {
        self.queue.is_empty()
    }

    pub fn notify(&self) -> Arc<Notify> {
        self.notify.clone()
    }
}

impl Default for TaskQueue {
    fn default() -> Self {
        Self::new()
    }
}

pub struct Scheduler {
    tasks: DashMap<TaskId, TaskDefinition>,
    queue: Arc<tokio::sync::Mutex<TaskQueue>>,
    cancellation_token: CancellationToken,
}

impl Scheduler {
    pub fn new(cancellation_token: CancellationToken) -> Self {
        Self {
            tasks: DashMap::new(),
            queue: Arc::new(tokio::sync::Mutex::new(TaskQueue::new())),
            cancellation_token,
        }
    }

    pub fn register_task(&self, task: TaskDefinition) -> Result<(), SchedulerError> {
        self.tasks.insert(task.task_id, task);
        Ok(())
    }

    pub fn unregister_task(&self, task_id: TaskId) -> Result<(), SchedulerError> {
        self.tasks
            .remove(&task_id)
            .ok_or(SchedulerError::TaskNotFound(task_id))?;
        Ok(())
    }

    pub fn get_task(&self, task_id: &TaskId) -> Option<TaskDefinition> {
        self.tasks.get(task_id).map(|r| r.value().clone())
    }

    pub fn has_task(&self, task_id: &TaskId) -> bool {
        self.tasks.contains_key(task_id)
    }

    pub async fn schedule(
        &self,
        task_id: TaskId,
        priority: Priority,
        scheduled_at: Option<i64>,
    ) -> Result<ScheduledTask, SchedulerError> {
        if !self.tasks.contains_key(&task_id) {
            return Err(SchedulerError::TaskNotFound(task_id));
        }

        let task_def = self.tasks.get(&task_id).unwrap().clone();
        let scheduled = ScheduledTask {
            task_id,
            execution_id: ExecutionId::new(),
            priority,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64,
            scheduled_at,
            max_retries: task_def.max_retries,
            timeout_ms: task_def.timeout_ms,
        };

        let mut queue = self.queue.lock().await;
        queue.enqueue(scheduled.clone());
        debug!(task_id = %task_id, "Task scheduled");

        Ok(scheduled)
    }

    pub async fn dequeue(&self) -> Option<ScheduledTask> {
        let mut queue = self.queue.lock().await;
        queue.dequeue()
    }

    pub async fn dequeue_or_wait(
        &self,
        cancellation_token: Option<&CancellationToken>,
    ) -> Option<ScheduledTask> {
        loop {
            if let Some(token) = cancellation_token {
                if token.is_cancelled() {
                    return None;
                }
            }

            let notify = {
                let mut queue = self.queue.lock().await;
                if let Some(task) = queue.dequeue() {
                    return Some(task);
                }
                queue.notify()
            };

            tokio::select! {
                _ = notify.notified() => {}
                else => { return None; }
            }
        }
    }

    pub async fn run(&self, cancellation_token: Option<&CancellationToken>) -> Option<ScheduledTask> {
        self.dequeue_or_wait(cancellation_token).await
    }

    pub fn queue_len(&self) -> usize {
        // Simplified - in production use AtomicUsize
        self.queue.try_lock().map(|q| q.len()).unwrap_or(0)
    }

    pub fn cancellation_token(&self) -> &CancellationToken {
        &self.cancellation_token
    }
}

pub fn schedule_task(
    scheduler: &Scheduler,
    task_id: TaskId,
    priority: Priority,
) -> impl std::future::Future<Output = Result<ScheduledTask, SchedulerError>> + '_ {
    scheduler.schedule(task_id, priority, None)
}

pub fn schedule_task_delayed(
    scheduler: &Scheduler,
    task_id: TaskId,
    priority: Priority,
    delay_ms: u64,
) -> impl std::future::Future<Output = Result<ScheduledTask, SchedulerError>> + '_ {
    let scheduled_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
        + delay_ms as i64;
    scheduler.schedule(task_id, priority, Some(scheduled_at))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_task(id: &str) -> TaskDefinition {
        TaskDefinition {
            task_id: TaskId::from_string(id).unwrap_or_else(|_| TaskId::new()),
            name: format!("task_{}", id),
            description: None,
            schema: None,
            max_retries: 3,
            timeout_ms: Some(30000),
        }
    }

    #[tokio::test]
    async fn test_register_and_schedule() {
        let scheduler = Scheduler::new(CancellationToken::new());
        let task_id = TaskId::new();
        let task = TaskDefinition {
            task_id,
            name: "test".to_string(),
            description: None,
            schema: None,
            max_retries: 3,
            timeout_ms: None,
        };
        scheduler.register_task(task).unwrap();
        let scheduled = scheduler
            .schedule(task_id, Priority::Normal, None)
            .await
            .unwrap();
        assert_eq!(scheduled.task_id, task_id);
    }

    #[tokio::test]
    async fn test_schedule_unregistered_task() {
        let scheduler = Scheduler::new(CancellationToken::new());
        let task_id = TaskId::new();
        let result = scheduler.schedule(task_id, Priority::Normal, None).await;
        assert!(matches!(result, Err(SchedulerError::TaskNotFound(_))));
    }

    #[tokio::test]
    async fn test_priority_ordering() {
        let scheduler = Scheduler::new(CancellationToken::new());
        let task_id = TaskId::new();
        scheduler
            .register_task(TaskDefinition {
                task_id,
                name: "test".to_string(),
                description: None,
                schema: None,
                max_retries: 3,
                timeout_ms: None,
            })
            .unwrap();

        let _ = scheduler
            .schedule(task_id, Priority::Low, None)
            .await
            .unwrap();
        scheduler
            .schedule(task_id, Priority::High, None)
            .await
            .unwrap();

        let first = scheduler.dequeue().await.unwrap();
        assert_eq!(first.priority.as_u8(), Priority::High.as_u8());
    }

    #[test]
    fn test_task_queue_ordering() {
        let mut queue = TaskQueue::new();
        let id1 = ExecutionId::new();
        let id2 = ExecutionId::new();

        queue.enqueue(ScheduledTask {
            task_id: TaskId::new(),
            execution_id: id1,
            priority: Priority::Low,
            created_at: 1,
            scheduled_at: None,
            max_retries: 3,
            timeout_ms: None,
        });

        queue.enqueue(ScheduledTask {
            task_id: TaskId::new(),
            execution_id: id2,
            priority: Priority::Critical,
            created_at: 2,
            scheduled_at: None,
            max_retries: 3,
            timeout_ms: None,
        });

        let first = queue.dequeue().unwrap();
        assert_eq!(first.execution_id, id2);
    }

    #[test]
    fn test_unregister_task() {
        let scheduler = Scheduler::new(CancellationToken::new());
        let task_id = TaskId::new();
        scheduler
            .register_task(create_test_task(&task_id.to_string()))
            .unwrap();
        assert!(scheduler.has_task(&task_id));
        scheduler.unregister_task(task_id).unwrap();
        assert!(!scheduler.has_task(&task_id));
    }
}
