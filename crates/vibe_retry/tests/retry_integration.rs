// Integration tests for retry logic: execute_with_retry (async) and
// execute_with_retry_fn (sync variants), calculate_backoff, and concurrency.
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};
use std::error::Error;
use vibe_retry::*;
use vibe_shared::RetryPolicy;
use vibe_cancellation::CancellationTokenSource;

fn small_policy() -> RetryPolicy {
    RetryPolicy {
        max_attempts: 3,
        base_delay_ms: 5,
        max_delay_ms: 100,
        backoff_multiplier: 2.0,
        retryable_errors: vec![],
    }
}

#[tokio::test]
async fn test_execute_with_retry_succeeds_immediately() {
    let policy = small_policy();
    let result = execute_with_retry(
        || async { Ok::<_, Box<dyn Error + Send + Sync>>(42) },
        &policy,
        None,
    )
    .await;
    assert_eq!(result.unwrap(), 42);
}

#[tokio::test]
async fn test_execute_with_retry_succeeds_after_two_failures() {
    let policy = RetryPolicy {
        max_attempts: 5,
        base_delay_ms: 5,
        max_delay_ms: 50,
        backoff_multiplier: 2.0,
        retryable_errors: vec![],
    };
    let attempts = Arc::new(AtomicU32::new(0));
    let attempts_clone = attempts.clone();
    let result = execute_with_retry(
        move || {
            let count = attempts_clone.fetch_add(1, Ordering::SeqCst);
            async move {
                if count < 2 {
                    Err::<u32, _>(Box::<dyn Error + Send + Sync>::from("not yet"))
                } else {
                    Ok::<u32, _>(99)
                }
            }
        },
        &policy,
        None,
    )
    .await;
    assert_eq!(result.unwrap(), 99);
    assert_eq!(attempts.load(Ordering::SeqCst), 3);
}

#[tokio::test]
async fn test_execute_with_retry_exhausted() {
    let policy = RetryPolicy {
        max_attempts: 2,
        base_delay_ms: 5,
        max_delay_ms: 10,
        backoff_multiplier: 2.0,
        retryable_errors: vec![],
    };
    let result = execute_with_retry(
        || async { Err::<u32, _>(Box::<dyn Error + Send + Sync>::from("always fails")) },
        &policy,
        None,
    )
    .await;
    assert!(matches!(result, Err(RetryError::Exhausted { attempts: 2 })));
}

#[tokio::test]
async fn test_execute_with_retry_cancelled() {
    let source = CancellationTokenSource::new();
    let token = source.token();
    source.cancel();
    let policy = small_policy();
    let result: Result<u32, RetryError> = execute_with_retry(
        || async { Err::<u32, _>(Box::<dyn Error + Send + Sync>::from("will not run")) },
        &policy,
        Some(&token),
    )
    .await;
    assert!(matches!(result, Err(RetryError::Cancelled)));
}

#[tokio::test]
async fn test_execute_with_retry_cancelled_mid_retry() {
    let source = CancellationTokenSource::new();
    let token = source.token();
    let token_clone = token.clone();
    let policy = RetryPolicy {
        max_attempts: 10,
        base_delay_ms: 100,
        max_delay_ms: 1000,
        backoff_multiplier: 2.0,
        retryable_errors: vec![],
    };
    let attempts = Arc::new(AtomicU32::new(0));
    let attempt_clone = attempts.clone();
    let handle = tokio::spawn(async move {
        execute_with_retry(
            move || {
                attempt_clone.fetch_add(1, Ordering::SeqCst);
                async { Err::<u32, _>(Box::<dyn Error + Send + Sync>::from("fail")) }
            },
            &policy,
            Some(&token_clone),
        )
        .await
    });
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    source.cancel();
    let result = handle.await.unwrap();
    assert!(matches!(result, Err(RetryError::Cancelled)));
    assert!(attempts.load(Ordering::SeqCst) < 10);
}

#[tokio::test]
async fn test_execute_with_retry_fn_succeeds_immediately() {
    let policy = small_policy();
    let result = execute_with_retry_fn(
        || Ok::<_, String>("hello".to_string()),
        &policy,
        None,
    )
    .await;
    assert_eq!(result.unwrap(), "hello");
}

#[tokio::test]
async fn test_execute_with_retry_fn_succeeds_after_failures() {
    let policy = RetryPolicy {
        max_attempts: 4,
        base_delay_ms: 5,
        max_delay_ms: 50,
        backoff_multiplier: 2.0,
        retryable_errors: vec![],
    };
    let attempts = Arc::new(AtomicU32::new(0));
    let attempts_clone = attempts.clone();
    let result = execute_with_retry_fn(
        move || {
            let prev = attempts_clone.fetch_add(1, Ordering::SeqCst);
            if prev < 2 {
                Err::<u32, _>("temporary".to_string())
            } else {
                Ok::<u32, _>(77)
            }
        },
        &policy,
        None,
    )
    .await;
    assert_eq!(result.unwrap(), 77);
    assert_eq!(attempts.load(Ordering::SeqCst), 3);
}

#[tokio::test]
async fn test_execute_with_retry_fn_exhausted() {
    let policy = RetryPolicy {
        max_attempts: 3,
        base_delay_ms: 5,
        max_delay_ms: 20,
        backoff_multiplier: 2.0,
        retryable_errors: vec![],
    };
    let result = execute_with_retry_fn(
        || Err::<u32, _>("always fails".to_string()),
        &policy,
        None,
    )
    .await;
    assert!(matches!(result, Err(RetryError::Exhausted { attempts: 3 })));
}

#[tokio::test]
async fn test_execute_with_retry_fn_cancelled() {
    let source = CancellationTokenSource::new();
    let token = source.token();
    source.cancel();
    let policy = small_policy();
    let result: Result<u32, RetryError> = execute_with_retry_fn(
        || Err::<u32, _>("cancelled".to_string()),
        &policy,
        Some(&token),
    )
    .await;
    assert!(matches!(result, Err(RetryError::Cancelled)));
}

#[test]
fn test_calculate_backoff_default_policy_increases() {
    let policy = RetryPolicy::default();
    let d0 = calculate_backoff(0, &policy);
    let d1 = calculate_backoff(1, &policy);
    let d2 = calculate_backoff(2, &policy);
    assert_eq!(d0.as_millis(), 1000);
    assert!(d1 > d0);
    assert!(d2 > d1);
}

#[test]
fn test_calculate_backoff_custom_policy() {
    let policy = RetryPolicy {
        max_attempts: 10,
        base_delay_ms: 100,
        max_delay_ms: 1000,
        backoff_multiplier: 2.0,
        retryable_errors: vec![],
    };
    let d0 = calculate_backoff(0, &policy);
    assert_eq!(d0.as_millis(), 100);
    let d1 = calculate_backoff(1, &policy);
    assert_eq!(d1.as_millis(), 200);
    let d2 = calculate_backoff(2, &policy);
    assert_eq!(d2.as_millis(), 400);
}

#[test]
fn test_calculate_backoff_respects_max_delay() {
    let policy = RetryPolicy {
        max_attempts: 10,
        base_delay_ms: 1000,
        max_delay_ms: 2500,
        backoff_multiplier: 10.0,
        retryable_errors: vec![],
    };
    let d = calculate_backoff(2, &policy);
    assert_eq!(d.as_millis(), 2500);
}

#[test]
fn test_calculate_backoff_small_multiplier() {
    let policy = RetryPolicy {
        max_attempts: 5,
        base_delay_ms: 1000,
        max_delay_ms: 5000,
        backoff_multiplier: 1.0,
        retryable_errors: vec![],
    };
    let d0 = calculate_backoff(0, &policy);
    let d1 = calculate_backoff(1, &policy);
    let d2 = calculate_backoff(2, &policy);
    assert_eq!(d0, d1);
    assert_eq!(d1, d2);
}

#[tokio::test]
async fn test_multiple_concurrent_retries_all_succeed() {
    let policy = small_policy();
    let num_tasks = 10;
    let mut handles = Vec::with_capacity(num_tasks);
    for i in 0..num_tasks {
        let p = policy.clone();
        handles.push(tokio::spawn(async move {
            execute_with_retry_fn(
                move || Ok::<_, String>(i),
                &p,
                None,
            )
            .await
        }));
    }
    for (idx, handle) in handles.into_iter().enumerate() {
        let result = handle.await.unwrap();
        assert_eq!(result.unwrap(), idx);
    }
}

#[tokio::test]
async fn test_multiple_concurrent_retries_some_fail_then_succeed() {
    let num_tasks = 10u32;
    let policy = RetryPolicy {
        max_attempts: num_tasks + 2,
        base_delay_ms: 5,
        max_delay_ms: 50,
        backoff_multiplier: 2.0,
        retryable_errors: vec![],
    };
    let counters: Vec<Arc<AtomicU32>> = (0..num_tasks)
        .map(|_| Arc::new(AtomicU32::new(0)))
        .collect();
    let mut handles = Vec::with_capacity(num_tasks as usize);
    for (i, counter) in counters.iter().enumerate() {
        let c = counter.clone();
        let p = policy.clone();
        handles.push(tokio::spawn(async move {
            execute_with_retry_fn(
                move || {
                    let attempt = c.fetch_add(1, Ordering::SeqCst);
                    if attempt < i as u32 {
                        Err::<u32, _>("not yet".to_string())
                    } else {
                        Ok::<u32, _>(attempt)
                    }
                },
                &p,
                None,
            )
            .await
        }));
    }
    for (idx, handle) in handles.into_iter().enumerate() {
        let result = handle.await.unwrap();
        assert!(result.is_ok(), "task {idx} failed: {:?}", result);
    }
}
