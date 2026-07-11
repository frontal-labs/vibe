//! Symbol table and name resolution for a parsed `.vibe` [`File`].
//!
//! The binder walks the AST once and records every named declaration (tool, agent,
//! model, memory, plugin). The [checker](../vibe_checker/index.html) uses the table
//! to resolve `use` edges and `model` references. See
//! `docs/language/02-compiler.md#3-bind`.
#![forbid(unsafe_code)]

use std::collections::HashMap;
use vibe_ast::{Decl, File};
use vibe_span::Span;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SymbolKind {
    Tool,
    Agent,
    Model,
    Memory,
    Plugin,
}

impl SymbolKind {
    pub fn label(self) -> &'static str {
        match self {
            SymbolKind::Tool => "tool",
            SymbolKind::Agent => "agent",
            SymbolKind::Model => "model",
            SymbolKind::Memory => "memory",
            SymbolKind::Plugin => "plugin",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Symbol {
    pub kind: SymbolKind,
    pub name: String,
    /// The span of the declaration's *name* (for diagnostics).
    pub span: Span,
    /// Whether the declaration is `export`ed.
    pub exported: bool,
}

#[derive(Debug, Default)]
pub struct SymbolTable {
    /// Every named declaration, in source order.
    pub entries: Vec<Symbol>,
    /// name → index of the *first* declaration with that name.
    index: HashMap<String, usize>,
}

impl SymbolTable {
    /// The first declaration with `name`, if any.
    pub fn lookup(&self, name: &str) -> Option<&Symbol> {
        self.index.get(name).map(|&i| &self.entries[i])
    }

    /// Names of all declarations of a given kind (for "did you mean" suggestions).
    pub fn names_of(&self, kind: SymbolKind) -> impl Iterator<Item = &str> {
        self.entries
            .iter()
            .filter(move |s| s.kind == kind)
            .map(|s| s.name.as_str())
    }

    /// Declarations whose name collides with an earlier one (all but the first).
    pub fn duplicates(&self) -> impl Iterator<Item = &Symbol> {
        let mut seen = std::collections::HashSet::new();
        self.entries
            .iter()
            .filter(move |s| !seen.insert(s.name.clone()))
    }
}

/// Build the symbol table for a file. Diagnostics (duplicates, unresolved uses)
/// are produced by the checker, which consumes this table.
pub fn bind(file: &File) -> SymbolTable {
    let mut table = SymbolTable::default();
    for decl in &file.decls {
        let sym = match decl {
            Decl::Tool(d) => Symbol {
                kind: SymbolKind::Tool,
                name: d.name.text.clone(),
                span: d.name.span,
                exported: d.exported,
            },
            Decl::Agent(d) => Symbol {
                kind: SymbolKind::Agent,
                name: d.name.text.clone(),
                span: d.name.span,
                exported: d.exported,
            },
            Decl::Model(d) => Symbol {
                kind: SymbolKind::Model,
                name: d.name.text.clone(),
                span: d.name.span,
                exported: d.exported,
            },
            Decl::Memory(d) => Symbol {
                kind: SymbolKind::Memory,
                name: d.name.text.clone(),
                span: d.name.span,
                exported: false,
            },
            Decl::Plugin(d) => Symbol {
                kind: SymbolKind::Plugin,
                name: d.name.text.clone(),
                span: d.name.span,
                exported: d.exported,
            },
            Decl::Config(_) | Decl::Import(_) => continue,
        };
        let idx = table.entries.len();
        table.index.entry(sym.name.clone()).or_insert(idx);
        table.entries.push(sym);
    }
    table
}

#[cfg(test)]
mod tests {
    use super::*;
    use vibe_ast::{AgentDecl, Ident, ToolDecl, TsSpan};

    fn tool(name: &str) -> Decl {
        Decl::Tool(ToolDecl {
            doc: None,
            exported: false,
            name: Ident {
                text: name.into(),
                span: Span::at(0),
            },
            params: vec![],
            ret: None,
            body: TsSpan(Span::at(0)),
            span: Span::at(0),
        })
    }

    fn agent(name: &str) -> Decl {
        Decl::Agent(AgentDecl {
            doc: None,
            exported: false,
            name: Ident {
                text: name.into(),
                span: Span::at(0),
            },
            members: vec![],
            span: Span::at(0),
        })
    }

    #[test]
    fn binds_names_and_kinds() {
        let file = File {
            decls: vec![tool("GetOrder"), agent("Support")],
        };
        let table = bind(&file);
        assert_eq!(table.lookup("GetOrder").unwrap().kind, SymbolKind::Tool);
        assert_eq!(table.lookup("Support").unwrap().kind, SymbolKind::Agent);
        assert!(table.lookup("Nope").is_none());
    }

    #[test]
    fn detects_duplicates() {
        let file = File {
            decls: vec![tool("Dup"), tool("Dup"), tool("Unique")],
        };
        let table = bind(&file);
        let dups: Vec<_> = table.duplicates().map(|s| s.name.as_str()).collect();
        assert_eq!(dups, vec!["Dup"]);
    }
}
