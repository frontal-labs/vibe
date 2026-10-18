// Integration tests for cancellation tokens: creation, cancellation,
// child tokens, callbacks, check_cancelled, and large-scale cancellation.
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use vibe_cancellation::*;

#[test]
fn test_token_not_cancelled_by_default() {
    let token = CancellationToken::new();
    assert!(!token.is_cancelled());
}

#[test]
fn test_cancel_via_source_marks_token_cancelled() {
    let source = CancellationTokenSource::new();
    let token = source.token();
    assert!(!token.is_cancelled());
    source.cancel();
    assert!(token.is_cancelled());
}

#[test]
fn test_multiple_tokens_from_one_source_all_cancelled() {
    let source = CancellationTokenSource::new();
    let t1 = source.token();
    let t2 = source.token();
    let t3 = source.token();
    source.cancel();
    assert!(t1.is_cancelled());
    assert!(t2.is_cancelled());
    assert!(t3.is_cancelled());
}

#[test]
fn test_child_token_cancelled_when_parent_cancelled() {
    let source = CancellationTokenSource::new();
    let parent = source.token();
    let child = parent.child_token();
    let grandchild = child.child_token();
    assert!(!child.is_cancelled());
    assert!(!grandchild.is_cancelled());
    source.cancel();
    assert!(parent.is_cancelled());
    assert!(child.is_cancelled());
    assert!(grandchild.is_cancelled());
}

#[test]
fn test_on_cancelled_callback_fires_on_cancel() {
    let source = CancellationTokenSource::new();
    let token = source.token();
    let invoked = Arc::new(AtomicBool::new(false));
    let invoked_clone = invoked.clone();
    token.on_cancelled(move || {
        invoked_clone.store(true, Ordering::SeqCst);
    });
    assert!(!invoked.load(Ordering::SeqCst));
    source.cancel();
    assert!(invoked.load(Ordering::SeqCst));
}

#[test]
fn test_on_cancelled_fires_immediately_if_already_cancelled() {
    let source = CancellationTokenSource::new();
    let token = source.token();
    source.cancel();
    let invoked = Arc::new(AtomicBool::new(false));
    let invoked_clone = invoked.clone();
    token.on_cancelled(move || {
        invoked_clone.store(true, Ordering::SeqCst);
    });
    assert!(invoked.load(Ordering::SeqCst));
}

#[test]
fn test_multiple_callbacks_all_fire() {
    let source = CancellationTokenSource::new();
    let token = source.token();
    let count = Arc::new(AtomicUsize::new(0));
    for _ in 0..5 {
        let c = count.clone();
        token.on_cancelled(move || {
            c.fetch_add(1, Ordering::SeqCst);
        });
    }
    source.cancel();
    assert_eq!(count.load(Ordering::SeqCst), 5);
}

#[test]
fn test_dropping_source_still_allows_token_to_be_checked() {
    let token = {
        let source = CancellationTokenSource::new();
        let token = source.token();
        assert!(!token.is_cancelled());
        token
    };
    assert!(!token.is_cancelled());
}

#[test]
fn test_dropping_source_after_cancel_preserves_cancelled_state() {
    let token = {
        let source = CancellationTokenSource::new();
        let token = source.token();
        source.cancel();
        token
    };
    assert!(token.is_cancelled());
}

#[test]
fn test_double_cancel_is_idempotent() {
    let source = CancellationTokenSource::new();
    let token = source.token();
    let count = Arc::new(AtomicUsize::new(0));
    let c = count.clone();
    token.on_cancelled(move || {
        c.fetch_add(1, Ordering::SeqCst);
    });
    source.cancel();
    source.cancel();
    assert!(token.is_cancelled());
    assert_eq!(count.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn test_check_cancelled_returns_error_on_cancelled_token() {
    let source = CancellationTokenSource::new();
    let token = source.token();
    source.cancel();
    let result = check_cancelled(&token).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn test_check_cancelled_succeeds_on_active_token() {
    let source = CancellationTokenSource::new();
    let token = source.token();
    let result = check_cancelled(&token).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_check_cancelled_many_times_on_active() {
    let source = CancellationTokenSource::new();
    let token = source.token();
    for _ in 0..10 {
        let result = check_cancelled(&token).await;
        assert!(result.is_ok());
    }
}

#[tokio::test]
async fn test_check_cancelled_after_delayed_cancel() {
    let source = CancellationTokenSource::new();
    let token = source.token();
    let token_clone = token.clone();
    let handle = tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        check_cancelled(&token_clone).await
    });
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    source.cancel();
    let result = handle.await.unwrap();
    assert!(result.is_err());
}

#[test]
fn test_one_thousand_tokens_from_one_source_cancel_all() {
    let source = CancellationTokenSource::new();
    let tokens: Vec<CancellationToken> = (0..1000).map(|_| source.token()).collect();
    for token in &tokens {
        assert!(!token.is_cancelled());
    }
    source.cancel();
    for (i, token) in tokens.iter().enumerate() {
        assert!(token.is_cancelled(), "token {i} should be cancelled");
    }
}

#[test]
fn test_one_thousand_child_tokens_cancelled() {
    let source = CancellationTokenSource::new();
    let parent = source.token();
    let children: Vec<CancellationToken> = (0..1000).map(|_| parent.child_token()).collect();
    source.cancel();
    assert!(parent.is_cancelled());
    for (i, child) in children.iter().enumerate() {
        assert!(child.is_cancelled(), "child token {i} should be cancelled");
    }
}
