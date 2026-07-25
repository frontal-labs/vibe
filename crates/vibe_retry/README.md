# vibe-retry

Configurable retry policies with exponential backoff, jitter, and cancellation support.

## Types

| Type | Description |
|------|-------------|
| `RetryError` | Enum: `Exhausted { attempts }` — all retries consumed; `Cancelled` — operation was cancelled |

## Functions

| Function | Description |
|----------|-------------|
| `default_retry_policy() -> RetryPolicy` | Returns a policy with 3 max attempts, 1s base delay, exponential multiplier of 2 |
| `calculate_backoff(attempt, policy) -> Duration` | Computes the delay for a given attempt number using exponential backoff |
| `execute_with_retry(operation, policy, cancellation_token) -> Result<T, RetryError>` | Async retry loop — runs the fallible operation up to `max_attempts` times with backoff between each attempt |
| `execute_with_retry_fn(operation, policy, cancellation_token) -> Result<T, RetryError>` | Synchronous variant of `execute_with_retry` for non-async operations |

Both retry functions accept an optional `CancellationToken` for cooperative cancellation during backoff delays.
