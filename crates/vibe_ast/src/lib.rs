//! The `.vibe` abstract syntax tree.
//!
//! Vibe-specific structure only. Embedded TypeScript (tool bodies, type
//! annotations, prompt interpolations) is stored as opaque [`TsSpan`]s and checked
//! downstream by `tsc`. See `docs/language/01-syntax.md` and `docs/specs/grammar.md`.
#![forbid(unsafe_code)]

use vibe_span::Span;

/// An identifier or bare word (owns its text for readable ASTs), plus its span.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ident {
    pub text: String,
    pub span: Span,
}

/// A captured span of embedded TypeScript (type, expression, or body) that the
/// Vibe front end does not parse — it is handed to `tsc` downstream.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TsSpan(pub Span);

/// A value for a `config`/`model`/`memory` field.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Value {
    /// A bare word or model id, e.g. `info`, `anthropic`, `claude-opus-4-8`.
    Word(Ident),
    /// A string literal (span includes the quotes; may be triple-quoted).
    Str(Span),
    /// A numeric literal (span; may contain `_` separators).
    Number(Span),
    /// A nested `{ ... }` block (inner span), e.g. `runtime { limits { ... } }`.
    /// Its contents are parsed in a later phase.
    Block(Span),
}

impl Value {
    pub fn span(&self) -> Span {
        match self {
            Value::Word(i) => i.span,
            Value::Str(s) | Value::Number(s) | Value::Block(s) => *s,
        }
    }
}

/// A `key value` field inside a `config`/`model`/`memory` block.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Field {
    pub key: Ident,
    pub value: Value,
    pub span: Span,
}

/// A single `tool` parameter: `name: <TS type> [@desc("...")]`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Param {
    pub name: Ident,
    pub ty: TsSpan,
    /// The string span of a `@desc("...")` annotation, if present.
    pub desc: Option<Span>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolDecl {
    pub doc: Option<Span>,
    pub exported: bool,
    pub name: Ident,
    pub params: Vec<Param>,
    /// The `-> <TS type>` return annotation, if present.
    pub ret: Option<TsSpan>,
    /// The tool body — opaque TypeScript.
    pub body: TsSpan,
    pub span: Span,
}

/// A member of an `agent { ... }` block.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AgentMember {
    /// `model <id-or-ref>`.
    Model(Ident),
    /// `use <tool | sub-agent | plugin>`.
    Use(Ident),
    /// Any other `key value` field (`system`, `effort`, `memory`, `maxIterations`).
    Field(Field),
    /// A member that failed to parse; recovery skipped to here.
    Error(Span),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentDecl {
    pub doc: Option<Span>,
    pub exported: bool,
    pub name: Ident,
    pub members: Vec<AgentMember>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfigDecl {
    pub fields: Vec<Field>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelDecl {
    pub exported: bool,
    pub name: Ident,
    pub fields: Vec<Field>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryDecl {
    pub name: Ident,
    pub fields: Vec<Field>,
    pub span: Span,
}

/// A `plugin` declaration. For R2 the body is captured raw; hook parsing is R4.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PluginDecl {
    pub exported: bool,
    pub name: Ident,
    pub body: TsSpan,
    pub span: Span,
}

/// An `import ... from "..."` statement. For R2 the clause is captured raw.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportDecl {
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decl {
    Import(ImportDecl),
    Config(ConfigDecl),
    Model(ModelDecl),
    Memory(MemoryDecl),
    Tool(ToolDecl),
    Agent(AgentDecl),
    Plugin(PluginDecl),
}

impl Decl {
    pub fn span(&self) -> Span {
        match self {
            Decl::Import(d) => d.span,
            Decl::Config(d) => d.span,
            Decl::Model(d) => d.span,
            Decl::Memory(d) => d.span,
            Decl::Tool(d) => d.span,
            Decl::Agent(d) => d.span,
            Decl::Plugin(d) => d.span,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct File {
    pub decls: Vec<Decl>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_file_has_no_decls() {
        assert!(File::default().decls.is_empty());
    }

    #[test]
    fn decl_span_delegates() {
        let d = Decl::Config(ConfigDecl {
            fields: vec![],
            span: Span::new(0, 8),
        });
        assert_eq!(d.span(), Span::new(0, 8));
    }
}
