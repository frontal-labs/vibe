# vibe-cancellation

Cancellation tokens and sources for cooperative cancellation across async boundaries.

## Types

| Type | Description |
|------|-------------|
| `CancellationToken` | `Clone`-able token that signals cancellation state via a shared `Arc<AtomicBool>` |
| `CancellationTokenSource` | Owner that creates tokens and triggers cancellation |
| `CancelledError` | Error returned when an operation is cancelled |

### CancellationToken

| Method | Description |
|--------|-------------|
| `new()` | Creates an unsignalled token |
| `is_cancelled() -> bool` | Checks whether cancellation has been requested |
| `on_cancelled(callback)` | Registers a `FnOnce` callback invoked when cancellation fires (runs immediately if already cancelled) |
| `child_token() -> CancellationToken` | Creates a linked child token that inherits the parent's cancellation state |

### CancellationTokenSource

| Method | Description |
|--------|-------------|
| `new()` | Creates a new source with an unsignalled token |
| `token() -> CancellationToken` | Returns the associated token |
| `cancel()` | Triggers cancellation on all derived tokens |

### Utility

| Function | Description |
|----------|-------------|
| `check_cancelled(token) -> Result` | Async helper that returns `CancelledError` if the token has been signalled |
