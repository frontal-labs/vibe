//! Checker tests: one per semantic rule, plus an `insta` snapshot of rendered
//! diagnostics for a file with several problems.

use super::*;

/// Parse → bind → check, asserting the input parses cleanly so tests isolate
/// *semantic* diagnostics.
fn diags(src: &str) -> Vec<Diagnostic> {
    let p = vibe_parser::parse(src);
    assert!(
        p.diagnostics.is_empty(),
        "unexpected parse errors: {:?}",
        p.diagnostics
    );
    let symbols = vibe_binder::bind(&p.file);
    check(src, &p.file, &symbols)
}

fn codes_of(ds: &[Diagnostic]) -> Vec<String> {
    ds.iter().map(|d| d.code.render()).collect()
}

fn has(ds: &[Diagnostic], code: &str) -> bool {
    ds.iter().any(|d| d.code.render() == code)
}

#[test]
fn valid_file_has_no_diagnostics() {
    let src = "\
config { name \"bot\" }
tool GetOrder(orderId: string) -> OrderStatus { db.find(orderId) }
agent Support { model claude-opus-4-8 use GetOrder }";
    assert_eq!(diags(src), vec![]);
}

#[test]
fn unknown_model_reports_vb2001_with_suggestion() {
    // One edit away from the real id (`-9` vs `-8`).
    let src = "tool T(x: string) { x } agent A { model claude-opus-4-9 use T }";
    let ds = diags(src);
    let d = ds
        .iter()
        .find(|d| d.code.render() == "VB2001")
        .expect("VB2001");
    assert!(d.message.contains("unknown model"));
    assert_eq!(d.help.as_deref(), Some("did you mean `claude-opus-4-8`?"));
}

#[test]
fn named_model_reference_resolves() {
    let src = "\
model Fast { id claude-haiku-4-5 }
tool T(x: string) { x }
agent A { model Fast use T }";
    assert_eq!(diags(src), vec![]);
}

#[test]
fn model_decl_with_bad_id_reports_vb2001() {
    let src = "model Fast { id claude-haiku-9 }";
    assert!(has(&diags(src), "VB2001"));
}

#[test]
fn unresolved_use_reports_vb2100_with_suggestion() {
    let src = "tool GetOrder(x: string) { x } agent A { use GetOrdr }";
    let ds = diags(src);
    let d = ds
        .iter()
        .find(|d| d.code.render() == "VB2100")
        .expect("VB2100");
    assert_eq!(d.help.as_deref(), Some("did you mean `GetOrder`?"));
}

#[test]
fn dead_tool_reports_vb3010_but_exported_is_exempt() {
    let unused = diags("tool Unused(x: string) { x }");
    assert!(has(&unused, "VB3010"));

    let exported = diags("export tool Pub(x: string) { x }");
    assert!(!has(&exported, "VB3010"));
}

#[test]
fn multiple_config_reports_vb2200() {
    let src = "config { name \"a\" } config { name \"b\" }";
    assert!(has(&diags(src), "VB2200"));
}

#[test]
fn duplicate_declaration_reports_vb2102() {
    let src = "tool Dup(x: string) { x } tool Dup(y: string) { y }";
    assert!(has(&diags(src), "VB2102"));
}

#[test]
fn use_cycle_between_agents_reports_vb2101() {
    let src = "agent A { use B } agent B { use A }";
    let ds = diags(src);
    assert_eq!(codes_of(&ds).iter().filter(|c| *c == "VB2101").count(), 2);
}

#[test]
fn self_use_is_a_cycle() {
    let src = "agent A { use A }";
    assert!(has(&diags(src), "VB2101"));
}

#[test]
fn function_parameter_type_reports_vb2300() {
    let src = "tool T(cb: (x: number) => void) { cb(1) } agent A { use T }";
    assert!(has(&diags(src), "VB2300"));
}

// ---- snapshot of rendered diagnostics ----

fn render(ds: &[Diagnostic]) -> String {
    let mut out = String::new();
    for d in ds {
        let help = d
            .help
            .as_ref()
            .map(|h| format!("  [help: {h}]"))
            .unwrap_or_default();
        out.push_str(&format!(
            "{} {:?} {}..{} {}{}\n",
            d.code.render(),
            d.severity,
            d.span.lo,
            d.span.hi,
            d.message,
            help
        ));
    }
    out
}

#[test]
fn snapshot_diagnostics_for_a_messy_file() {
    let src = "\
config { name \"a\" }
config { name \"b\" }
tool Orphan(x: string) { x }
agent Support { model claude-sonet-4-6 use Ghost }";
    insta::assert_snapshot!(render(&diags(src)));
}
