//! Recursive-descent parser: tokens → AST, with error recovery.
//!
//! The parser drives the [`Lexer`] directly (rather than consuming a flat token
//! stream) so it can rewind to a token's start and capture embedded TypeScript —
//! tool bodies via `capture_balanced`, type annotations via `capture_ts_type`.
//! See `docs/language/02-compiler.md` and `docs/specs/grammar.md`.
#![forbid(unsafe_code)]

use vibe_ast::{
    AgentDecl, AgentMember, ConfigDecl, Decl, Field, File, Ident, ImportDecl, MemoryDecl,
    ModelDecl, Param, PluginDecl, ToolDecl, TsSpan, Value,
};
use vibe_diagnostics::{codes, Diagnostic};
use vibe_lexer::{Keyword, Lexer, Token, TokenKind};
use vibe_span::Span;

#[derive(Debug, Default)]
pub struct Parse {
    pub file: File,
    pub diagnostics: Vec<Diagnostic>,
}

/// Parse `.vibe` source into a [`File`] plus diagnostics.
pub fn parse(src: &str) -> Parse {
    let mut p = Parser::new(src);
    let file = p.parse_file();
    Parse {
        file,
        diagnostics: p.finish(),
    }
}

struct Parser<'a> {
    src: &'a str,
    lexer: Lexer<'a>,
    peeked: Option<Token>,
    diags: Vec<Diagnostic>,
}

impl<'a> Parser<'a> {
    fn new(src: &'a str) -> Self {
        Self {
            src,
            lexer: Lexer::new(src),
            peeked: None,
            diags: Vec::new(),
        }
    }

    /// Merge parser and lexer diagnostics in source order.
    fn finish(mut self) -> Vec<Diagnostic> {
        self.diags.append(&mut self.lexer.diagnostics);
        self.diags.sort_by_key(|d| (d.span.lo, d.code.0));
        self.diags
    }

    // ---- token cursor ----

    fn peek(&mut self) -> Token {
        if self.peeked.is_none() {
            self.peeked = Some(self.lexer.next_token());
        }
        self.peeked.unwrap()
    }

    fn bump(&mut self) -> Token {
        let t = self.peek();
        self.peeked = None;
        t
    }

    fn at(&mut self, kind: TokenKind) -> bool {
        self.peek().node == kind
    }

    fn eat(&mut self, kind: TokenKind) -> Option<Token> {
        if self.at(kind) {
            Some(self.bump())
        } else {
            None
        }
    }

    fn slice(&self, span: Span) -> &'a str {
        &self.src[span.lo as usize..span.hi as usize]
    }

    fn ident_from(&self, t: Token) -> Ident {
        Ident {
            text: self.slice(t.span).to_string(),
            span: t.span,
        }
    }

    // ---- diagnostics ----

    fn error(&mut self, code: vibe_diagnostics::VbCode, span: Span, msg: impl Into<String>) {
        self.diags.push(Diagnostic::error(code, span, msg));
    }

    fn expect(&mut self, kind: TokenKind, what: &str) -> Option<Token> {
        if self.at(kind) {
            Some(self.bump())
        } else {
            let span = self.peek().span;
            self.error(codes::EXPECTED_TOKEN, span, format!("expected {what}"));
            None
        }
    }

    fn expect_ident(&mut self, what: &str) -> Option<Ident> {
        if self.at(TokenKind::Ident) {
            let t = self.bump();
            Some(self.ident_from(t))
        } else {
            let span = self.peek().span;
            self.error(codes::EXPECTED_TOKEN, span, format!("expected {what}"));
            None
        }
    }

    // ---- embedded-TypeScript capture ----

    /// Rewind the lexer to the start of the next (post-trivia) token and return
    /// that offset, clearing the lookahead so a `capture_*` call starts there.
    fn rewind_to_next(&mut self) -> u32 {
        let t = self.peek();
        self.lexer.set_pos(t.span.lo);
        self.peeked = None;
        t.span.lo
    }

    fn capture_type(&mut self, stops: &[char]) -> TsSpan {
        self.rewind_to_next();
        TsSpan(self.lexer.capture_ts_type(stops))
    }

    /// Capture a balanced `{ ... }` block, returning the inner span.
    fn capture_block(&mut self) -> Span {
        self.rewind_to_next();
        self.lexer
            .capture_balanced('{', '}')
            .unwrap_or_else(|| Span::at(self.lexer.pos()))
    }

    // ---- grammar ----

    fn parse_file(&mut self) -> File {
        let mut decls = Vec::new();
        loop {
            let t = self.peek();
            if t.node == TokenKind::Eof {
                break;
            }
            let before = t.span.lo;
            if let Some(d) = self.parse_decl() {
                decls.push(d);
            }
            // Guarantee forward progress even when a decl fails to parse.
            if self.peek().node != TokenKind::Eof && self.peek().span.lo == before {
                self.bump();
            }
        }
        File { decls }
    }

    fn parse_decl(&mut self) -> Option<Decl> {
        let doc = self.eat(TokenKind::DocComment).map(|t| t.span);
        let exported = self.eat(TokenKind::Keyword(Keyword::Export)).is_some();
        let start = self.peek().span.lo;

        match self.peek().node {
            TokenKind::Keyword(Keyword::Import) => self.parse_import(start),
            TokenKind::Keyword(Keyword::Config) => self.parse_config(start),
            TokenKind::Keyword(Keyword::Model) => self.parse_model(exported, start),
            TokenKind::Keyword(Keyword::Memory) => self.parse_memory(start),
            TokenKind::Keyword(Keyword::Tool) => self.parse_tool(doc, exported, start),
            TokenKind::Keyword(Keyword::Agent) => self.parse_agent(doc, exported, start),
            TokenKind::Keyword(Keyword::Plugin) => self.parse_plugin(exported, start),
            _ => {
                let span = self.peek().span;
                self.error(
                    codes::EXPECTED_DECL,
                    span,
                    "expected a declaration (import, config, model, memory, tool, agent, or plugin)",
                );
                self.bump();
                None
            }
        }
    }

    fn parse_import(&mut self, start: u32) -> Option<Decl> {
        self.bump(); // `import`
                     // Capture the whole statement up to and including the module string.
        loop {
            match self.peek().node {
                TokenKind::Str | TokenKind::TripleStr => {
                    let end = self.bump().span.hi;
                    return Some(Decl::Import(ImportDecl {
                        span: Span::new(start, end),
                    }));
                }
                TokenKind::Eof
                | TokenKind::Keyword(
                    Keyword::Import
                    | Keyword::Config
                    | Keyword::Model
                    | Keyword::Memory
                    | Keyword::Tool
                    | Keyword::Agent
                    | Keyword::Plugin,
                ) => {
                    let end = self.peek().span.lo;
                    self.error(
                        codes::EXPECTED_TOKEN,
                        Span::new(start, end),
                        "expected `from \"...\"` to end the import",
                    );
                    return Some(Decl::Import(ImportDecl {
                        span: Span::new(start, end),
                    }));
                }
                _ => {
                    self.bump();
                }
            }
        }
    }

    fn parse_config(&mut self, start: u32) -> Option<Decl> {
        self.bump(); // `config`
        self.expect(TokenKind::LBrace, "`{` after `config`")?;
        let fields = self.parse_fields();
        let end = self
            .expect(TokenKind::RBrace, "`}` to close `config`")?
            .span
            .hi;
        Some(Decl::Config(ConfigDecl {
            fields,
            span: Span::new(start, end),
        }))
    }

    fn parse_model(&mut self, exported: bool, start: u32) -> Option<Decl> {
        self.bump(); // `model`
        let name = self.expect_ident("a model name")?;
        self.expect(TokenKind::LBrace, "`{` after model name")?;
        let fields = self.parse_fields();
        let end = self
            .expect(TokenKind::RBrace, "`}` to close `model`")?
            .span
            .hi;
        Some(Decl::Model(ModelDecl {
            exported,
            name,
            fields,
            span: Span::new(start, end),
        }))
    }

    fn parse_memory(&mut self, start: u32) -> Option<Decl> {
        self.bump(); // `memory`
        let name = self.expect_ident("a memory name")?;
        self.expect(TokenKind::LBrace, "`{` after memory name")?;
        let fields = self.parse_fields();
        let end = self
            .expect(TokenKind::RBrace, "`}` to close `memory`")?
            .span
            .hi;
        Some(Decl::Memory(MemoryDecl {
            name,
            fields,
            span: Span::new(start, end),
        }))
    }

    /// Parse `key value` fields until `}` (or EOF). Separators (`;`) and `:` are
    /// optional. A nested `{ ... }` becomes a [`Value::Block`].
    fn parse_fields(&mut self) -> Vec<Field> {
        let mut fields = Vec::new();
        loop {
            match self.peek().node {
                TokenKind::RBrace | TokenKind::Eof => break,
                TokenKind::Semi => {
                    self.bump();
                }
                TokenKind::Ident | TokenKind::Keyword(_) => {
                    let t = self.bump();
                    let key = self.ident_from(t);
                    self.eat(TokenKind::Colon); // optional `:`
                    let value = self.parse_value();
                    let span = key.span.to(value.span());
                    fields.push(Field { key, value, span });
                    self.eat(TokenKind::Semi);
                }
                _ => {
                    let span = self.peek().span;
                    self.error(codes::UNEXPECTED_TOKEN, span, "expected a field name");
                    self.bump();
                }
            }
        }
        fields
    }

    fn parse_value(&mut self) -> Value {
        match self.peek().node {
            TokenKind::Str | TokenKind::TripleStr => Value::Str(self.bump().span),
            TokenKind::Number => Value::Number(self.bump().span),
            TokenKind::LBrace => Value::Block(self.capture_block()),
            TokenKind::Ident | TokenKind::Keyword(_) => {
                let t = self.bump();
                Value::Word(self.ident_from(t))
            }
            _ => {
                let span = self.peek().span;
                self.error(codes::UNEXPECTED_TOKEN, span, "expected a value");
                Value::Word(Ident {
                    text: String::new(),
                    span,
                })
            }
        }
    }

    fn parse_tool(&mut self, doc: Option<Span>, exported: bool, start: u32) -> Option<Decl> {
        self.bump(); // `tool`
        let name = self.expect_ident("a tool name")?;
        self.expect(TokenKind::LParen, "`(` after tool name")?;
        let params = self.parse_params();
        let ret = if self.at(TokenKind::Arrow) {
            self.bump();
            Some(self.capture_type(&['{']))
        } else {
            None
        };
        let body = self.parse_body();
        let end = self.lexer.pos();
        Some(Decl::Tool(ToolDecl {
            doc,
            exported,
            name,
            params,
            ret,
            body,
            span: Span::new(start, end),
        }))
    }

    fn parse_params(&mut self) -> Vec<Param> {
        let mut params = Vec::new();
        loop {
            match self.peek().node {
                TokenKind::RParen => {
                    self.bump();
                    break;
                }
                TokenKind::Eof => {
                    let span = self.peek().span;
                    self.error(codes::EXPECTED_TOKEN, span, "expected `)`");
                    break;
                }
                _ => {
                    let Some(name) = self.expect_ident("a parameter name") else {
                        // Recover: skip to the next `,` or `)`.
                        self.skip_params_recovery();
                        continue;
                    };
                    self.expect(TokenKind::Colon, "`:` after parameter name");
                    let ty = self.capture_type(&[',', ')', '@']);
                    let desc = if self.at(TokenKind::At) {
                        self.parse_desc()
                    } else {
                        None
                    };
                    let end = desc.map(|s| s.hi).unwrap_or(ty.0.hi);
                    params.push(Param {
                        name: name.clone(),
                        ty,
                        desc,
                        span: Span::new(name.span.lo, end),
                    });
                    match self.peek().node {
                        TokenKind::Comma => {
                            self.bump();
                        }
                        TokenKind::RParen => {
                            self.bump();
                            break;
                        }
                        TokenKind::Eof => break,
                        _ => {
                            let span = self.peek().span;
                            self.error(codes::UNEXPECTED_TOKEN, span, "expected `,` or `)`");
                            self.skip_params_recovery();
                        }
                    }
                }
            }
        }
        params
    }

    fn skip_params_recovery(&mut self) {
        loop {
            match self.peek().node {
                TokenKind::Comma => {
                    self.bump();
                    break;
                }
                TokenKind::RParen | TokenKind::Eof => break,
                _ => {
                    self.bump();
                }
            }
        }
    }

    /// `@desc("...")` — returns the string literal's span.
    fn parse_desc(&mut self) -> Option<Span> {
        self.bump(); // `@`
        self.expect_ident("`desc`")?;
        self.expect(TokenKind::LParen, "`(` after `@desc`")?;
        let s = self.peek();
        let span = match s.node {
            TokenKind::Str | TokenKind::TripleStr => {
                self.bump();
                s.span
            }
            _ => {
                self.error(
                    codes::EXPECTED_TOKEN,
                    s.span,
                    "expected a description string",
                );
                return None;
            }
        };
        self.expect(TokenKind::RParen, "`)` to close `@desc`")?;
        Some(span)
    }

    fn parse_body(&mut self) -> TsSpan {
        if !self.at(TokenKind::LBrace) {
            let span = self.peek().span;
            self.error(codes::EXPECTED_TOKEN, span, "expected `{` (tool body)");
            return TsSpan(Span::at(span.lo));
        }
        TsSpan(self.capture_block())
    }

    fn parse_agent(&mut self, doc: Option<Span>, exported: bool, start: u32) -> Option<Decl> {
        self.bump(); // `agent`
        let name = self.expect_ident("an agent name")?;
        self.expect(TokenKind::LBrace, "`{` after agent name")?;
        let mut members = Vec::new();
        loop {
            match self.peek().node {
                TokenKind::RBrace | TokenKind::Eof => break,
                TokenKind::Keyword(Keyword::Model) => {
                    self.bump();
                    if let Some(id) = self.expect_ident("a model id or reference") {
                        members.push(AgentMember::Model(id));
                    }
                }
                TokenKind::Keyword(Keyword::Use) => {
                    self.bump();
                    if let Some(id) = self.expect_ident("a tool, sub-agent, or plugin") {
                        members.push(AgentMember::Use(id));
                    }
                }
                TokenKind::Ident | TokenKind::Keyword(_) => {
                    let t = self.bump();
                    let key = self.ident_from(t);
                    self.eat(TokenKind::Colon);
                    let value = self.parse_value();
                    let span = key.span.to(value.span());
                    members.push(AgentMember::Field(Field { key, value, span }));
                    self.eat(TokenKind::Semi);
                }
                _ => {
                    let span = self.peek().span;
                    self.error(codes::UNEXPECTED_TOKEN, span, "expected an agent member");
                    self.bump();
                    members.push(AgentMember::Error(span));
                }
            }
        }
        let end = self
            .expect(TokenKind::RBrace, "`}` to close `agent`")?
            .span
            .hi;
        Some(Decl::Agent(AgentDecl {
            doc,
            exported,
            name,
            members,
            span: Span::new(start, end),
        }))
    }

    fn parse_plugin(&mut self, exported: bool, start: u32) -> Option<Decl> {
        self.bump(); // `plugin`
        let name = self.expect_ident("a plugin name")?;
        let body = self.parse_body();
        let end = self.lexer.pos();
        Some(Decl::Plugin(PluginDecl {
            exported,
            name,
            body,
            span: Span::new(start, end),
        }))
    }
}

#[cfg(test)]
mod tests;
