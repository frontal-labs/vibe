use std::time::Duration;
use thiserror::Error;
use tokio::time::sleep;
use tracing::{debug, warn};
use vibe_cancellation::CancellationToken;
use vibe_shared::RetryPolicy;

#[derive(Debug, Clone, Error)]
pub enum RetryError {
    #[error("Operation failed after {attempts} attempt(s)")]
    Exhausted {
        attempts: u32,
    },
    #[error("Operation cancelled")]
    Cancelled,
}

pub fn default_retry_policy() -> RetryPolicy {
    RetryPolicy::default()
}

pub fn calculate_backoff(attempt: u32, policy: &RetryPolicy) -> Duration {
    if attempt == 0 {
        return Duration::from_millis(policy.base_delay_ms);
    }
    let multiplier = policy.backoff_multiplier.powf(attempt as f64);
    let delay = (policy.base_delay_ms as f64 * multiplier) as u64;
    let delay = delay.min(policy.max_delay_ms);
    Duration::from_millis(delay)
}

pub async fn execute_with_retry<F, Fut, T>(
    operation: F,
    policy: &RetryPolicy,
    cancellation_token: Option<&CancellationToken>,
) -> Result<T, RetryError>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T, Box<dyn std::error::Error + Send + Sync>>>,
{
    for attempt in 1..=policy.max_attempts {
        if let Some(token) = cancellation_token {
            if token.is_cancelled() {
                return Err(RetryError::Cancelled);
            }
        }

        match operation().await {
            Ok(result) => return Ok(result),
            Err(_err) => {
                if attempt < policy.max_attempts {
                    let delay = calculate_backoff(attempt, policy);
                    debug!(
                        attempt = attempt,
                        max_attempts = policy.max_attempts,
                        delay_ms = delay.as_millis(),
                        "Retrying operation"
                    );
                    sleep(delay).await;
                }
            }
        }
    }

    Err(RetryError::Exhausted {
        attempts: policy.max_attempts,
    })
}

pub async fn execute_with_retry_fn<F, T, E>(
    operation: F,
    policy: &RetryPolicy,
    cancellation_token: Option<&CancellationToken>,
) -> Result<T, RetryError>
where
    F: Fn() -> Result<T, E>,
    E: std::fmt::Display,
{
    for attempt in 1..=policy.max_attempts {
        if let Some(token) = cancellation_token {
            if token.is_cancelled() {
                return Err(RetryError::Cancelled);
            }
        }

        match operation() {
            Ok(result) => return Ok(result),
            Err(err) => {
                warn!(attempt, error = %err, "Operation failed");
                if attempt < policy.max_attempts {
                    let delay = calculate_backoff(attempt, policy);
                    sleep(delay).await;
                }
            }
        }
    }

    Err(RetryError::Exhausted {
        attempts: policy.max_attempts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicU32, Ordering};

    #[test]
    fn test_calculate_backoff_increases() {
        let policy = RetryPolicy {
            max_attempts: 5,
            base_delay_ms: 1000,
            max_delay_ms: 30000,
            backoff_multiplier: 2.0,
            retryable_errors: vec![],
        };
        let d1 = calculate_backoff(1, &policy);
        let d2 = calculate_backoff(2, &policy);
        let d3 = calculate_backoff(3, &policy);
        assert!(d2 > d1);
        assert!(d3 > d2);
    }

    #[test]
    fn test_calculate_backoff_respects_max() {
        let policy = RetryPolicy {
            max_attempts: 10,
            base_delay_ms: 1000,
            max_delay_ms: 5000,
            backoff_multiplier: 10.0,
            retryable_errors: vec![],
        };
        let delay = calculate_backoff(5, &policy);
        assert!(delay.as_millis() <= 5000);
    }

    #[test]
    fn test_calculate_backoff_first_attempt() {
        let policy = RetryPolicy {
            max_attempts: 3,
            base_delay_ms: 500,
            max_delay_ms: 10000,
            backoff_multiplier: 2.0,
            retryable_errors: vec![],
        };
        let delay = calculate_backoff(0, &policy);
        assert_eq!(delay.as_millis(), 500);
    }

    #[tokio::test]
    async fn test_execute_with_retry_succeeds_immediately() {
        let policy = RetryPolicy::default();
        let result = execute_with_retry_fn(
            || Ok::<_, String>(42),
            &policy,
            None,
        )
        .await;
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_execute_with_retry_succeeds_after_failures() {
        let policy = RetryPolicy {
            max_attempts: 3,
            base_delay_ms: 10,
            max_delay_ms: 100,
            backoff_multiplier: 2.0,
            retryable_errors: vec![],
        };
        let attempts = Arc::new(AtomicU32::new(0));
        let attempts_clone = attempts.clone();
        let result = execute_with_retry_fn(
            move || {
                let prev = attempts_clone.fetch_add(1, Ordering::SeqCst);
                if prev < 1 {
                    Err::<u32, _>("temporary failure".to_string())
                } else {
                    Ok(99u32)
                }
            },
            &policy,
            None,
        )
        .await;
        assert_eq!(result.unwrap(), 99);
        assert_eq!(attempts.load(Ordering::SeqCst), 2);
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
        let result = execute_with_retry_fn(
            || Err::<u32, _>("always fails".to_string()),
            &policy,
            None,
        )
        .await;
        assert!(matches!(result, Err(RetryError::Exhausted { attempts: 2, .. })));
    }

    #[tokio::test]
    async fn test_execute_with_retry_cancelled() {
        let source = vibe_cancellation::CancellationTokenSource::new();
        let token = source.token();
        source.cancel();
        let policy = RetryPolicy::default();
        let result: Result<u32, RetryError> = execute_with_retry_fn(
            || Err::<u32, _>("should not retry".to_string()),
            &policy,
            Some(&token),
        )
        .await;
        assert!(matches!(result, Err(RetryError::Cancelled)));
    }

    #[tokio::test]
    async fn test_execute_with_retry_fn_succeeds() {
        let policy = RetryPolicy::default();
        let result = execute_with_retry_fn(
            || Ok::<_, String>("hello".to_string()),
            &policy,
            None,
        )
        .await;
        assert_eq!(result.unwrap(), "hello");
    }

    proptest::proptest! {
        #[test]
        fn test_backoff_never_zero(attempt in 0u32..10) {
            let policy = RetryPolicy {
                max_attempts: 10,
                base_delay_ms: 100,
                max_delay_ms: 10000,
                backoff_multiplier: 2.0,
                retryable_errors: vec![],
            };
            let delay = calculate_backoff(attempt, &policy);
            assert!(delay.as_millis() > 0);
        }
    }
}
