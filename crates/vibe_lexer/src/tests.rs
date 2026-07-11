//! Lexer tests: exact-token assertions, TS-span capture, diagnostics, and
//! `insta` snapshots of the token stream for the documented examples.

use super::*;

/// Render `(kind, span, text)` for every token, plus any diagnostics, as a stable
/// string for snapshot comparison.
fn render(src: &str) -> String {
    let (tokens, diagnostics) = tokenize(src);
    let mut out = String::new();
    for t in &tokens {
        let text = &src[t.span.lo as usize..t.span.hi as usize];
        out.push_str(&format!(
            "{:<18} {:>3}..{:<3} {:?}\n",
            format!("{:?}", t.node),
            t.span.lo,
            t.span.hi,
            text
        ));
    }
    if !diagnostics.is_empty() {
        out.push_str("--- diagnostics ---\n");
        for d in &diagnostics {
            out.push_str(&format!(
                "{} {:?} {}..{} {}\n",
                d.code.render(),
                d.severity,
                d.span.lo,
                d.span.hi,
                d.message
            ));
        }
    }
    out
}

/// The token kinds only (no spans), for compact structural assertions.
fn kinds(src: &str) -> Vec<TokenKind> {
    tokenize(src).0.into_iter().map(|t| t.node).collect()
}

#[test]
fn keyword_classification() {
    assert_eq!(Keyword::from_ident("agent"), Some(Keyword::Agent));
    assert_eq!(Keyword::from_ident("tool"), Some(Keyword::Tool));
    assert_eq!(Keyword::from_ident("db"), None);
}

#[test]
fn punctuation_and_arrow() {
    use TokenKind as Tk;
    assert_eq!(
        kinds("{ } ( ) : , ; @ ->"),
        vec![
            Tk::LBrace,
            Tk::RBrace,
            Tk::LParen,
            Tk::RParen,
            Tk::Colon,
            Tk::Comma,
            Tk::Semi,
            Tk::At,
            Tk::Arrow,
            Tk::Eof
        ]
    );
}

#[test]
fn agent_header_tokens() {
    use TokenKind as Tk;
    assert_eq!(
        kinds("agent Support { model claude-opus-4-8 }"),
        vec![
            Tk::Keyword(Keyword::Agent),
            Tk::Ident,
            Tk::LBrace,
            Tk::Keyword(Keyword::Model),
            Tk::Ident,
            Tk::RBrace,
            Tk::Eof
        ]
    );
}

#[test]
fn hyphenated_model_id_is_one_ident() {
    let (tokens, diags) = tokenize("claude-opus-4-8");
    assert!(diags.is_empty());
    assert_eq!(tokens[0].node, TokenKind::Ident);
    assert_eq!(tokens[0].span, Span::new(0, 15));
}

#[test]
fn number_allows_underscores() {
    let (tokens, _) = tokenize("120_000");
    assert_eq!(tokens[0].node, TokenKind::Number);
    assert_eq!(tokens[0].span, Span::new(0, 7));
}

#[test]
fn simple_string_with_interpolation() {
    let src = r#""hi ${company.name}!""#;
    let (tokens, diags) = tokenize(src);
    assert!(diags.is_empty());
    assert_eq!(tokens[0].node, TokenKind::Str);
    // The whole literal, including the interpolation, is one token.
    assert_eq!(
        &src[tokens[0].span.lo as usize..tokens[0].span.hi as usize],
        src
    );
}

#[test]
fn triple_quoted_string_is_multiline() {
    let src = "\"\"\"line one\nline two\"\"\"";
    let (tokens, diags) = tokenize(src);
    assert!(diags.is_empty());
    assert_eq!(tokens[0].node, TokenKind::TripleStr);
    assert_eq!(tokens[0].span, Span::new(0, src.len() as u32));
}

#[test]
fn doc_comment_is_a_token_but_line_comment_is_not() {
    use TokenKind as Tk;
    assert_eq!(
        kinds("/// describe me\ntool"),
        vec![Tk::DocComment, Tk::Keyword(Keyword::Tool), Tk::Eof]
    );
    assert_eq!(
        kinds("// just a comment\ntool"),
        vec![Tk::Keyword(Keyword::Tool), Tk::Eof]
    );
}

#[test]
fn block_comment_is_skipped() {
    assert_eq!(
        kinds("/* a */ agent"),
        vec![TokenKind::Keyword(Keyword::Agent), TokenKind::Eof]
    );
}

#[test]
fn unterminated_string_reports_vb1001() {
    let (_, diags) = tokenize("\"oops");
    assert_eq!(diags.len(), 1);
    assert_eq!(diags[0].code.render(), "VB1001");
}

#[test]
fn unexpected_char_reports_vb1004() {
    let (tokens, diags) = tokenize("%");
    assert_eq!(tokens[0].node, TokenKind::Unknown);
    assert_eq!(diags.len(), 1);
    assert_eq!(diags[0].code.render(), "VB1004");
}

#[test]
fn capture_balanced_tool_body() {
    let mut lx = Lexer::new("{ return db.find(orderId) }");
    let inner = lx.capture_balanced('{', '}').unwrap();
    assert_eq!(
        &"{ return db.find(orderId) }"[inner.lo as usize..inner.hi as usize],
        " return db.find(orderId) "
    );
}

#[test]
fn capture_balanced_handles_nesting_and_strings() {
    let src = r#"{ if (x) { y } else { s = "}" } }"#;
    let mut lx = Lexer::new(src);
    let inner = lx.capture_balanced('{', '}').unwrap();
    // The `}` inside the string must not close the body early.
    assert_eq!(
        &src[inner.lo as usize..inner.hi as usize],
        r#" if (x) { y } else { s = "}" } "#
    );
    assert!(lx.diagnostics.is_empty());
}

#[test]
fn capture_balanced_unbalanced_reports_vb1003() {
    let mut lx = Lexer::new("{ oops (");
    assert!(lx.capture_balanced('{', '}').is_none());
    assert_eq!(lx.diagnostics[0].code.render(), "VB1003");
}

#[test]
fn capture_ts_type_stops_at_top_level_delimiter() {
    let src = "string) -> R";
    let mut lx = Lexer::new(src);
    let ty = lx.capture_ts_type(&[',', ')']);
    assert_eq!(&src[ty.lo as usize..ty.hi as usize], "string");
}

#[test]
fn capture_ts_type_skips_nested_generics() {
    let src = "Array<{ a: number }>, next";
    let mut lx = Lexer::new(src);
    let ty = lx.capture_ts_type(&[',', ')']);
    assert_eq!(&src[ty.lo as usize..ty.hi as usize], "Array<{ a: number }>");
}

// ---- insta snapshots of full examples ----

#[test]
fn snapshot_config_block() {
    insta::assert_snapshot!(render(
        "config { name \"support-bot\" ; provider anthropic }"
    ));
}

#[test]
fn snapshot_agent_with_prompt() {
    let src =
        "agent Support {\n  model claude-opus-4-8\n  system \"Be concise.\"\n  use GetOrder\n}";
    insta::assert_snapshot!(render(src));
}
