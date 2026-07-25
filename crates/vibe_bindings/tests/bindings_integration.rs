use vibe_bindings::version;

#[test]
fn test_version_non_empty() {
    assert!(!version().is_empty());
}
