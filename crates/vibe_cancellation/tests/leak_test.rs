use vibe_cancellation::CancellationTokenSource;

#[test]
fn test_10k_concurrent_cancellation_tokens() {
    let mut sources = Vec::with_capacity(10_000);

    for i in 0..10_000 {
        let source = CancellationTokenSource::new();
        let token = source.token();
        assert!(!token.is_cancelled());
        if i % 2 == 0 {
            source.cancel();
            assert!(token.is_cancelled());
        }
        sources.push(source);
    }

    assert_eq!(sources.len(), 10_000);
}
