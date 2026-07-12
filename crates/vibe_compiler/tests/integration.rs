//! End-to-end integration tests for the compiler facade's public API.
use vibe_compiler::{check_json, compile, format};

const APP: &str = "config { name \"demo\" ; provider anthropic }\n\n\
/// Greet someone.\n\
tool Greet(name: string) -> string { return `Hi ${name}` }\n\n\
agent Assistant {\n  model claude-opus-4-8\n  system \"You are helpful.\"\n  use Greet\n}\n";

#[test]
fn compiles_tool_and_agent_to_typescript() {
    let comp = compile(APP);
    assert!(
        !comp.has_errors(),
        "expected no errors, got {:?}",
        comp.diagnostics
    );
    let ts = &comp.outputs[0].typescript;
    assert!(
        ts.contains("defineTool"),
        "emit should call defineTool:\n{ts}"
    );
    assert!(
        ts.contains("createAgent"),
        "emit should call createAgent:\n{ts}"
    );
}

#[test]
fn check_json_reports_zero_errors_for_valid_source() {
    let json = check_json(APP);
    assert!(json.contains("\"errorCount\":0"), "unexpected: {json}");
}

#[test]
fn format_is_idempotent() {
    let once = format(APP);
    let twice = format(&once);
    assert_eq!(once, twice, "formatting should be idempotent");
}
