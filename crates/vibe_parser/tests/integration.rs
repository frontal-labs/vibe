//! Integration tests for the parser's public entry point.
use vibe_parser::parse;

#[test]
fn parses_a_valid_program_without_diagnostics() {
    let src = "config { name \"x\" ; provider anthropic }\n\nagent A {\n  model claude-opus-4-8\n  system \"s\"\n}\n";
    let result = parse(src);
    assert!(
        result.diagnostics.is_empty(),
        "unexpected diagnostics: {:?}",
        result.diagnostics
    );
    assert!(
        !result.file.decls.is_empty(),
        "expected at least one declaration"
    );
}

#[test]
fn reports_diagnostics_for_broken_source() {
    let result = parse("agent {{{ broken");
    assert!(!result.diagnostics.is_empty(), "expected parse diagnostics");
}
