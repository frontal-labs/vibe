//! Formatter tests: normalization, idempotency, and invalid-input safety.

use super::format;

#[test]
fn normalizes_config() {
    let messy = "config{name \"bot\";provider anthropic}";
    assert_eq!(
        format(messy),
        "config {\n  name \"bot\"\n  provider anthropic\n}\n"
    );
}

#[test]
fn normalizes_tool_params_and_body() {
    assert_eq!(
        format("tool T(a:string,b:number){x}"),
        "tool T(a: string, b: number) { x }\n"
    );
}

#[test]
fn normalizes_agent_members() {
    assert_eq!(
        format("agent A{model claude-opus-4-8 use T}"),
        "agent A {\n  model claude-opus-4-8\n  use T\n}\n"
    );
}

#[test]
fn preserves_doc_comment_and_export() {
    let src = "///doc\nexport tool T(x: string)->R{ y }";
    let out = format(src);
    assert!(out.starts_with("///doc\nexport tool T(x: string) -> R"));
}

#[test]
fn multiline_body_is_kept_verbatim() {
    let src = "tool T() {\n  const a = 1\n  return a\n}";
    let out = format(src);
    assert!(out.contains("const a = 1"));
    assert!(out.contains("return a"));
}

#[test]
fn blank_line_between_declarations() {
    let src = "config { name \"a\" } tool T(x: string) { x }";
    let out = format(src);
    assert!(out.contains("}\n\ntool T"));
}

#[test]
fn is_idempotent() {
    let corpus = [
        "config{name \"a\";provider anthropic}",
        "tool GetOrder(id:string @desc(\"the id\"))->OrderStatus{ return db.find(id) }",
        "agent A{model claude-opus-4-8 system \"hi\" use GetOrder}",
        "model Fast{id claude-haiku-4-5;effort low}",
        "import { db } from \"./db\"\nconfig { name \"x\" }\ntool T(x: string) { x }",
        "tool Multi() {\n  const a = 1\n  return a\n}\nagent A { use Multi }",
    ];
    for src in corpus {
        let once = format(src);
        let twice = format(&once);
        assert_eq!(once, twice, "not idempotent for:\n{src}");
    }
}

#[test]
fn invalid_source_is_returned_unchanged() {
    let broken = "tool T(";
    assert_eq!(format(broken), broken);
}
