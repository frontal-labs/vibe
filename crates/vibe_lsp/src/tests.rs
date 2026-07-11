//! Tests for the pure LSP feature functions (no async runtime needed).

use super::features::*;

#[test]
fn diagnostics_match_the_checker() {
    assert!(
        diagnostics("tool T(x: string) { x } agent A { model claude-opus-4-8 use T }").is_empty()
    );

    let ds = diagnostics("agent A { use Ghost }");
    assert_eq!(ds.len(), 1);
    assert_eq!(ds[0].code, "VB2100");
    assert_eq!(ds[0].severity, Sev::Error);
    assert_eq!(ds[0].range.start.line, 0);
}

#[test]
fn completions_after_use_offer_symbols() {
    let src = "tool GetOrder(x: string) { x } agent A { use ";
    let items = completions(src, src.len());
    assert!(items
        .iter()
        .any(|c| c.label == "GetOrder" && c.kind == CompletionKind::Symbol));
}

#[test]
fn completions_after_model_offer_catalog() {
    let src = "agent A { model claude-op";
    let items = completions(src, src.len());
    assert!(items
        .iter()
        .any(|c| c.label == "claude-opus-4-8" && c.kind == CompletionKind::Model));
}

#[test]
fn completions_at_top_level_offer_keywords() {
    let items = completions("", 0);
    assert!(items
        .iter()
        .any(|c| c.label == "agent" && c.kind == CompletionKind::Keyword));
    assert!(items.iter().any(|c| c.label == "tool"));
}

#[test]
fn hover_describes_a_symbol() {
    let src = "tool GetOrder(x: string) { x } agent A { use GetOrder }";
    let offset = src.rfind("GetOrder").unwrap() + 2;
    let text = hover(src, offset).expect("hover");
    assert!(text.contains("tool"));
    assert!(text.contains("GetOrder"));
}

#[test]
fn goto_jumps_to_the_declaration() {
    let src = "tool GetOrder(x: string) { x } agent A { use GetOrder }";
    let offset = src.rfind("GetOrder").unwrap() + 2;
    let range = goto_definition(src, offset).expect("definition");
    // The tool name `GetOrder` starts at column 5 on line 0 (`tool GetOrder`).
    assert_eq!(range.start, Pos { line: 0, col: 5 });
}

#[test]
fn hover_and_goto_return_none_off_a_symbol() {
    let src = "tool GetOrder(x: string) { x }";
    // Offset in whitespace.
    let offset = src.find(' ').unwrap();
    assert!(hover(src, offset).is_none());
    assert!(goto_definition(src, offset).is_none());
}
