//! The `.vibe` lexer.
//!
//! Produces a flat token stream for the Vibe "skeleton" (keywords, punctuation,
//! strings, numbers, doc comments). Embedded TypeScript — tool bodies, type
//! annotations, `${}` interpolations — is **not** tokenized as Vibe; the parser
//! grabs those as opaque byte spans via [`Lexer::capture_balanced`] and
//! [`Lexer::capture_ts_type`], and they are checked downstream by `tsc`.
//!
//! See `docs/language/02-compiler.md` and `docs/specs/grammar.md`.
#![forbid(unsafe_code)]

use vibe_diagnostics::{codes, Diagnostic};
use vibe_span::{Span, Spanned};

/// Contextual keywords. Recognized only at declaration positions by the parser,
/// so a TypeScript identifier named `agent` inside a captured span still works.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Keyword {
    Agent,
    Tool,
    Model,
    Memory,
    Plugin,
    Config,
    Use,
    Import,
    Export,
    On,
    With,
}

impl Keyword {
    pub fn from_ident(s: &str) -> Option<Self> {
        Some(match s {
            "agent" => Self::Agent,
            "tool" => Self::Tool,
            "model" => Self::Model,
            "memory" => Self::Memory,
            "plugin" => Self::Plugin,
            "config" => Self::Config,
            "use" => Self::Use,
            "import" => Self::Import,
            "export" => Self::Export,
            "on" => Self::On,
            "with" => Self::With,
            _ => return None,
        })
    }
}

/// The kind of a lexed token. Text is recovered from the source via the span.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TokenKind {
    Keyword(Keyword),
    /// An identifier or bare word — includes hyphenated model ids like
    /// `claude-opus-4-8`.
    Ident,
    Number,
    /// A `"..."` string literal (may contain `${}` interpolations).
    Str,
    /// A `"""..."""` triple-quoted string literal.
    TripleStr,
    /// A `///` documentation comment (becomes a declaration description).
    DocComment,
    Arrow,
    LBrace,
    RBrace,
    LParen,
    RParen,
    Colon,
    Comma,
    Semi,
    At,
    /// An unexpected character (a diagnostic is emitted alongside).
    Unknown,
    Eof,
}

pub type Token = Spanned<TokenKind>;

/// A cursor-based lexer. The parser drives it, interleaving [`Lexer::next_token`]
/// with the `capture_*` methods when it needs a raw TypeScript span.
pub struct Lexer<'a> {
    src: &'a str,
    pos: usize,
    pub diagnostics: Vec<Diagnostic>,
}

impl<'a> Lexer<'a> {
    pub fn new(src: &'a str) -> Self {
        Self {
            src,
            pos: 0,
            diagnostics: Vec::new(),
        }
    }

    pub fn pos(&self) -> u32 {
        self.pos as u32
    }

    /// Rewind or advance the cursor to an absolute byte offset. The parser uses
    /// this to return to a token's start before capturing an embedded-TS span.
    pub fn set_pos(&mut self, pos: u32) {
        self.pos = pos as usize;
    }

    /// The source text covered by `span`.
    pub fn slice(&self, span: Span) -> &'a str {
        &self.src[span.lo as usize..span.hi as usize]
    }

    fn rest(&self) -> &'a str {
        &self.src[self.pos..]
    }

    fn peek(&self) -> Option<char> {
        self.rest().chars().next()
    }

    fn nth(&self, n: usize) -> Option<char> {
        self.rest().chars().nth(n)
    }

    fn starts_with(&self, s: &str) -> bool {
        self.rest().starts_with(s)
    }

    fn bump(&mut self) -> Option<char> {
        let c = self.rest().chars().next()?;
        self.pos += c.len_utf8();
        Some(c)
    }

    fn span_from(&self, lo: u32) -> Span {
        Span::new(lo, self.pos as u32)
    }

    /// Skip whitespace and non-doc comments. Returns a `DocComment` token when it
    /// consumes a `///` comment (which is meaningful), otherwise `None`.
    fn skip_trivia(&mut self) -> Option<Token> {
        loop {
            match self.peek() {
                Some(c) if c.is_whitespace() => {
                    self.bump();
                }
                Some('/') if self.starts_with("///") && !self.starts_with("////") => {
                    let lo = self.pos as u32;
                    while let Some(c) = self.peek() {
                        if c == '\n' {
                            break;
                        }
                        self.bump();
                    }
                    return Some(Spanned::new(TokenKind::DocComment, self.span_from(lo)));
                }
                Some('/') if self.starts_with("//") => {
                    while let Some(c) = self.peek() {
                        if c == '\n' {
                            break;
                        }
                        self.bump();
                    }
                }
                Some('/') if self.starts_with("/*") => {
                    let lo = self.pos as u32;
                    self.bump();
                    self.bump();
                    let mut closed = false;
                    while let Some(c) = self.bump() {
                        if c == '*' && self.peek() == Some('/') {
                            self.bump();
                            closed = true;
                            break;
                        }
                    }
                    if !closed {
                        self.diagnostics.push(Diagnostic::error(
                            codes::UNTERMINATED_BLOCK_COMMENT,
                            self.span_from(lo),
                            "unterminated block comment",
                        ));
                    }
                }
                _ => return None,
            }
        }
    }

    /// Lex the next token. Returns [`TokenKind::Eof`] at end of input.
    pub fn next_token(&mut self) -> Token {
        if let Some(doc) = self.skip_trivia() {
            return doc;
        }
        let lo = self.pos as u32;
        let Some(c) = self.peek() else {
            return Spanned::new(TokenKind::Eof, Span::at(lo));
        };

        // Punctuation.
        let punct = match c {
            '{' => Some(TokenKind::LBrace),
            '}' => Some(TokenKind::RBrace),
            '(' => Some(TokenKind::LParen),
            ')' => Some(TokenKind::RParen),
            ':' => Some(TokenKind::Colon),
            ',' => Some(TokenKind::Comma),
            ';' => Some(TokenKind::Semi),
            '@' => Some(TokenKind::At),
            _ => None,
        };
        if let Some(kind) = punct {
            self.bump();
            return Spanned::new(kind, self.span_from(lo));
        }

        if c == '-' {
            if self.nth(1) == Some('>') {
                self.bump();
                self.bump();
                return Spanned::new(TokenKind::Arrow, self.span_from(lo));
            }
            self.bump();
            self.diagnostics.push(Diagnostic::error(
                codes::UNEXPECTED_CHAR,
                self.span_from(lo),
                "unexpected '-' (did you mean '->'?)",
            ));
            return Spanned::new(TokenKind::Unknown, self.span_from(lo));
        }

        if c == '"' {
            return self.lex_string(lo);
        }
        if c.is_ascii_digit() {
            return self.lex_number(lo);
        }
        if is_ident_start(c) {
            return self.lex_ident(lo);
        }

        // Anything else is an unexpected character.
        self.bump();
        self.diagnostics.push(Diagnostic::error(
            codes::UNEXPECTED_CHAR,
            self.span_from(lo),
            format!("unexpected character {c:?}"),
        ));
        Spanned::new(TokenKind::Unknown, self.span_from(lo))
    }

    fn lex_ident(&mut self, lo: u32) -> Token {
        self.bump(); // start char
        loop {
            match self.peek() {
                Some(c) if is_ident_continue(c) => {
                    self.bump();
                }
                // A hyphen joins a bare word (e.g. `claude-opus-4-8`) only when the
                // next char is alphanumeric — so it never eats `->` or a trailing `-`.
                Some('-') if self.nth(1).is_some_and(|n| n.is_ascii_alphanumeric()) => {
                    self.bump();
                }
                _ => break,
            }
        }
        let text = &self.src[lo as usize..self.pos];
        let kind = match Keyword::from_ident(text) {
            Some(kw) => TokenKind::Keyword(kw),
            None => TokenKind::Ident,
        };
        Spanned::new(kind, self.span_from(lo))
    }

    fn lex_number(&mut self, lo: u32) -> Token {
        self.bump();
        while let Some(c) = self.peek() {
            if c.is_ascii_digit() || c == '_' {
                self.bump();
            } else {
                break;
            }
        }
        Spanned::new(TokenKind::Number, self.span_from(lo))
    }

    fn lex_string(&mut self, lo: u32) -> Token {
        if self.starts_with("\"\"\"") {
            return self.lex_triple_string(lo);
        }
        self.bump(); // opening quote
        let mut interp: usize = 0;
        loop {
            match self.peek() {
                None => {
                    self.unterminated_string(lo);
                    break;
                }
                Some('\\') if interp == 0 => {
                    self.bump();
                    self.bump();
                }
                Some('$') if interp == 0 && self.nth(1) == Some('{') => {
                    self.bump();
                    self.bump();
                    interp += 1;
                }
                Some('{') if interp > 0 => {
                    self.bump();
                    interp += 1;
                }
                Some('}') if interp > 0 => {
                    self.bump();
                    interp -= 1;
                }
                Some('"') if interp == 0 => {
                    self.bump();
                    break;
                }
                Some('\n') if interp == 0 => {
                    self.unterminated_string(lo);
                    break;
                }
                Some(_) => {
                    self.bump();
                }
            }
        }
        Spanned::new(TokenKind::Str, self.span_from(lo))
    }

    fn lex_triple_string(&mut self, lo: u32) -> Token {
        self.bump();
        self.bump();
        self.bump(); // opening """
        let mut interp: usize = 0;
        loop {
            if self.peek().is_none() {
                self.unterminated_string(lo);
                break;
            }
            if interp == 0 && self.starts_with("\"\"\"") {
                self.bump();
                self.bump();
                self.bump();
                break;
            }
            match self.peek() {
                Some('$') if interp == 0 && self.nth(1) == Some('{') => {
                    self.bump();
                    self.bump();
                    interp += 1;
                }
                Some('{') if interp > 0 => {
                    self.bump();
                    interp += 1;
                }
                Some('}') if interp > 0 => {
                    self.bump();
                    interp -= 1;
                }
                _ => {
                    self.bump();
                }
            }
        }
        Spanned::new(TokenKind::TripleStr, self.span_from(lo))
    }

    fn unterminated_string(&mut self, lo: u32) {
        self.diagnostics.push(Diagnostic::error(
            codes::UNTERMINATED_STRING,
            self.span_from(lo),
            "unterminated string literal",
        ));
    }

    /// Capture the balanced content between `open` and `close`, assuming the cursor
    /// is at `open`. Returns the **inner** span (excluding the delimiters) and
    /// leaves the cursor just past `close`. Strings and comments inside are skipped
    /// so their delimiters don't miscount. Used by the parser for tool bodies.
    pub fn capture_balanced(&mut self, open: char, close: char) -> Option<Span> {
        if self.peek() != Some(open) {
            return None;
        }
        self.bump();
        let inner_lo = self.pos as u32;
        let mut depth = 1usize;
        loop {
            match self.peek() {
                None => {
                    self.diagnostics.push(Diagnostic::error(
                        codes::UNBALANCED_DELIMITER,
                        Span::new(inner_lo, self.pos as u32),
                        format!("unbalanced '{open}' — expected '{close}'"),
                    ));
                    return None;
                }
                Some('"') | Some('\'') | Some('`') => self.skip_string_like(),
                Some('/') if self.starts_with("//") || self.starts_with("/*") => {
                    self.skip_comment_like();
                }
                Some(c) if c == open => {
                    depth += 1;
                    self.bump();
                }
                Some(c) if c == close => {
                    depth -= 1;
                    if depth == 0 {
                        let inner = Span::new(inner_lo, self.pos as u32);
                        self.bump();
                        return Some(inner);
                    }
                    self.bump();
                }
                Some(_) => {
                    self.bump();
                }
            }
        }
    }

    /// Capture a TypeScript type span starting at the cursor, up to the first
    /// top-level occurrence of any char in `stops` (nested brackets/generics and
    /// strings are skipped). Leaves the cursor at the stop char. Trailing
    /// whitespace is trimmed from the returned span.
    pub fn capture_ts_type(&mut self, stops: &[char]) -> Span {
        let lo = self.pos as u32;
        let mut depth = 0i32;
        loop {
            match self.peek() {
                None => break,
                // A stop char at the top level ends the type — checked *before* the
                // open-bracket arm so a body `{` (a valid stop) isn't mistaken for a
                // nested object type.
                Some(c) if depth == 0 && stops.contains(&c) => break,
                Some('"') | Some('\'') | Some('`') => self.skip_string_like(),
                Some('(' | '[' | '{' | '<') => {
                    depth += 1;
                    self.bump();
                }
                Some(')' | ']' | '}' | '>') if depth > 0 => {
                    depth -= 1;
                    self.bump();
                }
                Some(_) => {
                    self.bump();
                }
            }
        }
        // Trim trailing whitespace from the captured span.
        let mut hi = self.pos;
        while hi > lo as usize
            && self.src[..hi]
                .chars()
                .next_back()
                .is_some_and(|c| c.is_whitespace())
        {
            hi -= self.src[..hi].chars().next_back().unwrap().len_utf8();
        }
        Span::new(lo, hi as u32)
    }

    fn skip_string_like(&mut self) {
        let quote = self.bump().unwrap();
        while let Some(c) = self.bump() {
            if c == '\\' {
                self.bump();
            } else if c == quote {
                break;
            }
        }
    }

    fn skip_comment_like(&mut self) {
        if self.starts_with("//") {
            while let Some(c) = self.peek() {
                if c == '\n' {
                    break;
                }
                self.bump();
            }
        } else {
            // block comment
            self.bump();
            self.bump();
            while let Some(c) = self.bump() {
                if c == '*' && self.peek() == Some('/') {
                    self.bump();
                    break;
                }
            }
        }
    }
}

fn is_ident_start(c: char) -> bool {
    c.is_ascii_alphabetic() || c == '_'
}

fn is_ident_continue(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// Tokenize a whole source string. Returns the tokens (ending in `Eof`) and any
/// lexer diagnostics.
pub fn tokenize(src: &str) -> (Vec<Token>, Vec<Diagnostic>) {
    let mut lexer = Lexer::new(src);
    let mut tokens = Vec::new();
    loop {
        let tok = lexer.next_token();
        let is_eof = tok.node == TokenKind::Eof;
        tokens.push(tok);
        if is_eof {
            break;
        }
    }
    (tokens, lexer.diagnostics)
}

#[cfg(test)]
mod tests;
