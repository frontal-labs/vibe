//! Integration tests for the canonical `.vibe` formatter.
use vibe_fmt::format;

#[test]
fn formats_and_is_idempotent() {
    let messy = "agent   A    {\n  model claude-opus-4-8\n  system \"s\"\n}\n";
    let once = format(messy);
    let twice = format(&once);
    assert_eq!(once, twice);
}

#[test]
fn invalid_source_is_returned_unchanged() {
    let broken = "agent {{{ not valid";
    assert_eq!(format(broken), broken);
}
