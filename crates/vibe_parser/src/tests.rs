//! Parser tests: AST structure, embedded-TypeScript span capture, error recovery,
//! and an `insta` snapshot of a full file's AST.

use super::parse;
use vibe_ast::{AgentMember, Decl, Value};
use vibe_span::Span;

fn slice(src: &str, s: Span) -> &str {
    &src[s.lo as usize..s.hi as usize]
}

fn only_decl(src: &str) -> Decl {
    let p = parse(src);
    assert!(
        p.diagnostics.is_empty(),
        "unexpected diagnostics: {:?}",
        p.diagnostics
    );
    assert_eq!(p.file.decls.len(), 1, "expected exactly one decl");
    p.file.decls.into_iter().next().unwrap()
}

#[test]
fn tool_with_return_type_and_body() {
    let src = "tool GetOrder(orderId: string) -> OrderStatus { return db.find(orderId) }";
    let Decl::Tool(t) = only_decl(src) else {
        panic!("expected a tool")
    };
    assert_eq!(t.name.text, "GetOrder");
    assert!(!t.exported);
    assert_eq!(t.params.len(), 1);
    assert_eq!(t.params[0].name.text, "orderId");
    assert_eq!(slice(src, t.params[0].ty.0), "string");
    assert_eq!(slice(src, t.ret.unwrap().0), "OrderStatus");
    assert_eq!(slice(src, t.body.0), " return db.find(orderId) ");
}

#[test]
fn tool_with_desc_and_no_return() {
    let src = r#"tool T(id: string @desc("the id")) { work() }"#;
    let Decl::Tool(t) = only_decl(src) else {
        panic!("expected a tool")
    };
    assert_eq!(slice(src, t.params[0].ty.0), "string");
    assert_eq!(slice(src, t.params[0].desc.unwrap()), r#""the id""#);
    assert!(t.ret.is_none());
    assert_eq!(slice(src, t.body.0), " work() ");
}

#[test]
fn tool_with_two_params() {
    let src = "tool T(a: string, b: Array<number>) { x }";
    let Decl::Tool(t) = only_decl(src) else {
        panic!("expected a tool")
    };
    assert_eq!(t.params.len(), 2);
    assert_eq!(slice(src, t.params[0].ty.0), "string");
    assert_eq!(t.params[1].name.text, "b");
    assert_eq!(slice(src, t.params[1].ty.0), "Array<number>");
}

#[test]
fn doc_comment_and_export_attach_to_tool() {
    let src = "/// Look it up.\nexport tool GetOrder(id: string) { db(id) }";
    let Decl::Tool(t) = only_decl(src) else {
        panic!("expected a tool")
    };
    assert!(t.exported);
    assert_eq!(slice(src, t.doc.unwrap()), "/// Look it up.");
}

#[test]
fn agent_members() {
    let src =
        "agent Support {\n  model claude-opus-4-8\n  system \"Be concise.\"\n  use GetOrder\n}";
    let Decl::Agent(a) = only_decl(src) else {
        panic!("expected an agent")
    };
    assert_eq!(a.name.text, "Support");
    assert_eq!(a.members.len(), 3);
    match &a.members[0] {
        AgentMember::Model(id) => assert_eq!(id.text, "claude-opus-4-8"),
        m => panic!("expected model, got {m:?}"),
    }
    match &a.members[1] {
        AgentMember::Field(f) => {
            assert_eq!(f.key.text, "system");
            assert_eq!(slice(src, f.value.span()), "\"Be concise.\"");
        }
        m => panic!("expected field, got {m:?}"),
    }
    match &a.members[2] {
        AgentMember::Use(id) => assert_eq!(id.text, "GetOrder"),
        m => panic!("expected use, got {m:?}"),
    }
}

#[test]
fn config_fields() {
    let src = "config { name \"support-bot\" ; provider anthropic }";
    let Decl::Config(c) = only_decl(src) else {
        panic!("expected config")
    };
    assert_eq!(c.fields.len(), 2);
    assert_eq!(c.fields[0].key.text, "name");
    assert_eq!(slice(src, c.fields[0].value.span()), "\"support-bot\"");
    match &c.fields[1].value {
        Value::Word(w) => assert_eq!(w.text, "anthropic"),
        v => panic!("expected word, got {v:?}"),
    }
}

#[test]
fn config_nested_block_is_captured() {
    let src = "config { runtime { limits { http: 8 } } }";
    let Decl::Config(c) = only_decl(src) else {
        panic!("expected config")
    };
    assert_eq!(c.fields[0].key.text, "runtime");
    match &c.fields[0].value {
        Value::Block(span) => assert_eq!(slice(src, *span), " limits { http: 8 } "),
        v => panic!("expected block, got {v:?}"),
    }
}

#[test]
fn model_declaration() {
    let src = "model Fast { id claude-haiku-4-5 ; effort low }";
    let Decl::Model(m) = only_decl(src) else {
        panic!("expected model")
    };
    assert_eq!(m.name.text, "Fast");
    assert_eq!(m.fields.len(), 2);
    match &m.fields[0].value {
        Value::Word(w) => assert_eq!(w.text, "claude-haiku-4-5"),
        v => panic!("expected word, got {v:?}"),
    }
}

#[test]
fn import_statement_span() {
    let src = "import { db } from \"./db\"";
    let Decl::Import(i) = only_decl(src) else {
        panic!("expected import")
    };
    assert_eq!(slice(src, i.span), src);
}

#[test]
fn recovers_from_garbage_before_a_good_decl() {
    let src = "garbage tool Ok(x: string) { y }";
    let p = parse(src);
    assert!(!p.diagnostics.is_empty());
    let has_tool = p
        .file
        .decls
        .iter()
        .any(|d| matches!(d, Decl::Tool(t) if t.name.text == "Ok"));
    assert!(has_tool, "should still parse the tool after recovery");
}

#[test]
fn missing_body_reports_vb2000() {
    let src = "tool T(x: string)";
    let p = parse(src);
    assert!(p.diagnostics.iter().any(|d| d.code.render() == "VB2000"));
    // The tool is still recovered.
    assert!(matches!(p.file.decls.first(), Some(Decl::Tool(_))));
}

// ---- insta snapshot of a full file's AST ----

#[test]
fn snapshot_full_file_ast() {
    let src = "\
import { db } from \"./db\"

config { name \"bot\" ; provider anthropic }

/// Look up an order.
tool GetOrder(orderId: string) -> OrderStatus { return db.find(orderId) }

agent Support {
  model claude-opus-4-8
  system \"Be concise.\"
  use GetOrder
}
";
    let p = parse(src);
    assert!(p.diagnostics.is_empty(), "diags: {:?}", p.diagnostics);
    insta::assert_debug_snapshot!(p.file);
}
