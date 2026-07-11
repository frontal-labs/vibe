//! Pure language-feature logic for the Vibe language server.
//!
//! These functions take source text (and a byte offset for position-based
//! requests) and return editor-agnostic results, so they're unit-tested without an
//! LSP runtime. `main.rs` adapts them to `tower-lsp` types. They reuse the same
//! compiler front end as the CLI, so editor and `vibe check` never disagree.

use vibe_binder::SymbolKind;
use vibe_span::{SourceFile, SourceId};

/// A 0-based line/column position (LSP convention).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Pos {
    pub line: u32,
    pub col: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Range {
    pub start: Pos,
    pub end: Pos,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Sev {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diag {
    pub range: Range,
    pub severity: Sev,
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompletionKind {
    Keyword,
    Model,
    Symbol,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Completion {
    pub label: String,
    pub kind: CompletionKind,
}

fn source(src: &str) -> SourceFile {
    SourceFile::new(SourceId(0), "file.vibe", src)
}

fn pos(sf: &SourceFile, offset: u32) -> Pos {
    let loc = sf.location(offset);
    Pos {
        line: loc.line - 1,
        col: loc.col - 1,
    }
}

/// Diagnostics for a document (the same set `vibe check` reports).
pub fn diagnostics(src: &str) -> Vec<Diag> {
    let comp = vibe_compiler::compile(src);
    let sf = source(src);
    comp.diagnostics
        .iter()
        .map(|d| {
            let start = pos(&sf, d.span.lo);
            let end = pos(&sf, d.span.hi.max(d.span.lo));
            Diag {
                range: Range { start, end },
                severity: match d.severity {
                    vibe_compiler::Severity::Error => Sev::Error,
                    vibe_compiler::Severity::Warning => Sev::Warning,
                    vibe_compiler::Severity::Info => Sev::Info,
                },
                code: d.display_code(),
                message: d.message.clone(),
            }
        })
        .collect()
}

/// Context-aware completions at a byte offset:
/// after `model` → catalog ids; after `use` → in-scope tool/agent/plugin names;
/// otherwise the top-level keywords.
pub fn completions(src: &str, offset: usize) -> Vec<Completion> {
    let line_prefix = src[..offset.min(src.len())]
        .rsplit('\n')
        .next()
        .unwrap_or("");
    match context_keyword(line_prefix) {
        Some("use") => symbol_completions(src),
        Some("model") => vibe_checker::model_catalog()
            .iter()
            .map(|m| Completion {
                label: (*m).to_string(),
                kind: CompletionKind::Model,
            })
            .collect(),
        _ => [
            "agent", "tool", "model", "memory", "plugin", "config", "use", "import",
        ]
        .iter()
        .map(|k| Completion {
            label: (*k).to_string(),
            kind: CompletionKind::Keyword,
        })
        .collect(),
    }
}

fn symbol_completions(src: &str) -> Vec<Completion> {
    let parse = vibe_parser::parse(src);
    let table = vibe_binder::bind(&parse.file);
    table
        .entries
        .iter()
        .filter(|s| {
            matches!(
                s.kind,
                SymbolKind::Tool | SymbolKind::Agent | SymbolKind::Plugin
            )
        })
        .map(|s| Completion {
            label: s.name.clone(),
            kind: CompletionKind::Symbol,
        })
        .collect()
}

/// The keyword governing the token being typed at the end of `line_prefix`
/// (e.g. `use ` / `use Get` → `use`; `model claude-op` → `model`).
fn context_keyword(line_prefix: &str) -> Option<&str> {
    let ends_with_ws = line_prefix.ends_with(char::is_whitespace);
    let mut toks: Vec<&str> = line_prefix.split_whitespace().collect();
    if !ends_with_ws {
        toks.pop(); // drop the partial identifier being typed
    }
    toks.last().copied()
}

/// Hover text for the symbol at `offset`, if any.
pub fn hover(src: &str, offset: usize) -> Option<String> {
    let word = word_at(src, offset)?;
    let parse = vibe_parser::parse(src);
    let table = vibe_binder::bind(&parse.file);
    let sym = table.lookup(&word)?;
    Some(format!(
        "**{}** `{}` — declared in this file",
        sym.kind.label(),
        sym.name
    ))
}

/// The definition range for the symbol at `offset` (e.g. go-to on a `use X`).
pub fn goto_definition(src: &str, offset: usize) -> Option<Range> {
    let word = word_at(src, offset)?;
    let parse = vibe_parser::parse(src);
    let table = vibe_binder::bind(&parse.file);
    let sym = table.lookup(&word)?;
    let sf = source(src);
    Some(Range {
        start: pos(&sf, sym.span.lo),
        end: pos(&sf, sym.span.hi),
    })
}

/// The identifier (letters, digits, `_`, `-`) surrounding a byte offset.
fn word_at(src: &str, offset: usize) -> Option<String> {
    let bytes = src.as_bytes();
    let is_word = |b: u8| b.is_ascii_alphanumeric() || b == b'_' || b == b'-';
    let n = src.len();
    let mut start = offset.min(n);
    let mut end = offset.min(n);
    while start > 0 && is_word(bytes[start - 1]) {
        start -= 1;
    }
    while end < n && is_word(bytes[end]) {
        end += 1;
    }
    if start == end {
        return None;
    }
    Some(src[start..end].to_string())
}
