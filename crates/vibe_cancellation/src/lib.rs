use parking_lot::Mutex;
use std::fmt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use thiserror::Error;

#[derive(Clone)]
pub struct CancellationToken {
    inner: Arc<CancellationTokenInner>,
}

impl fmt::Debug for CancellationToken {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CancellationToken")
            .field("cancelled", &self.is_cancelled())
            .finish()
    }
}

struct CancellationTokenInner {
    cancelled: AtomicBool,
    callbacks: Mutex<Vec<Box<dyn FnOnce() + Send + 'static>>>,
}

impl CancellationToken {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(CancellationTokenInner {
                cancelled: AtomicBool::new(false),
                callbacks: Mutex::new(Vec::new()),
            }),
        }
    }

    pub fn is_cancelled(&self) -> bool {
        self.inner.cancelled.load(Ordering::SeqCst)
    }

    pub fn on_cancelled<F>(&self, callback: F)
    where
        F: FnOnce() + Send + 'static,
    {
        let mut callbacks = self.inner.callbacks.lock();
        if self.inner.cancelled.load(Ordering::SeqCst) {
            drop(callbacks);
            callback();
        } else {
            callbacks.push(Box::new(callback));
        }
    }

    pub fn child_token(&self) -> CancellationToken {
        let child = CancellationToken::new();
        let child_inner = child.inner.clone();
        self.on_cancelled(move || {
            let was_cancelled = child_inner.cancelled.swap(true, Ordering::SeqCst);
            if !was_cancelled {
                let callbacks = std::mem::take(&mut *child_inner.callbacks.lock());
                for cb in callbacks {
                    cb();
                }
            }
        });
        child
    }
}

impl Default for CancellationToken {
    fn default() -> Self {
        Self::new()
    }
}

pub struct CancellationTokenSource {
    token: CancellationToken,
}

impl CancellationTokenSource {
    pub fn new() -> Self {
        Self {
            token: CancellationToken::new(),
        }
    }

    pub fn token(&self) -> CancellationToken {
        self.token.clone()
    }

    pub fn cancel(&self) {
        let was_cancelled = self.token.inner.cancelled.swap(true, Ordering::SeqCst);
        if !was_cancelled {
            let callbacks = std::mem::take(&mut *self.token.inner.callbacks.lock());
            for cb in callbacks {
                cb();
            }
        }
    }
}

impl Default for CancellationTokenSource {
    fn default() -> Self {
        Self::new()
    }
}

pub async fn check_cancelled(token: &CancellationToken) -> Result<(), CancelledError> {
    if token.is_cancelled() {
        return Err(CancelledError);
    }
    tokio::task::yield_now().await;
    Ok(())
}

#[derive(Debug, Clone, Error)]
#[error("Operation was cancelled")]
pub struct CancelledError;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_token_not_cancelled_by_default() {
        let token = CancellationToken::new();
        assert!(!token.is_cancelled());
    }

    #[test]
    fn test_token_is_cancelled_after_source_cancel() {
        let source = CancellationTokenSource::new();
        let token = source.token();
        source.cancel();
        assert!(token.is_cancelled());
    }

    #[test]
    fn test_callback_invoked_on_cancel() {
        let source = CancellationTokenSource::new();
        let token = source.token();
        let invoked = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let invoked_clone = invoked.clone();
        token.on_cancelled(move || {
            invoked_clone.store(true, Ordering::SeqCst);
        });
        source.cancel();
        assert!(invoked.load(Ordering::SeqCst));
    }

    #[test]
    fn test_child_token_cancelled_with_parent() {
        let source = CancellationTokenSource::new();
        let parent = source.token();
        let child = parent.child_token();
        source.cancel();
        assert!(child.is_cancelled());
    }

    #[test]
    fn test_multiple_tokens() {
        let source = CancellationTokenSource::new();
        let t1 = source.token();
        let t2 = source.token();
        source.cancel();
        assert!(t1.is_cancelled());
        assert!(t2.is_cancelled());
    }

    #[tokio::test]
    async fn test_check_cancelled_not_cancelled() {
        let source = CancellationTokenSource::new();
        let token = source.token();
        let result = check_cancelled(&token).await;
        assert!(result.is_ok());
    }
}
