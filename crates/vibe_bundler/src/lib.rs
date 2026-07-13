//! Static analysis of a Vibe app's agent/tool TypeScript modules, powering the
//! optimizing bundler: extract each module's imports so `@vibe/build` can build the
//! agent→tool graph and lazily code-split tools (minimal cold-start payloads).
#![forbid(unsafe_code)]

use oxc_allocator::Allocator;
use oxc_ast::ast::{ImportDeclarationSpecifier, Statement};
use oxc_parser::Parser;
use oxc_span::SourceType;
use serde::Serialize;

/// One `import` declaration's bindings.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ImportInfo {
    /// The module specifier (e.g. `"../tools/get-order"`).
    pub source: String,
    /// The default-import local name, if any (`import X from "..."`).
    pub default_local: Option<String>,
    /// Named imports as `(imported, local)` pairs.
    pub named: Vec<(String, String)>,
}

/// Parse a TS/JS module and return all of its `import` declarations.
pub fn imports(source: &str) -> Vec<ImportInfo> {
    let allocator = Allocator::default();
    let ret = Parser::new(&allocator, source, SourceType::ts()).parse();
    let mut out = Vec::new();

    for stmt in &ret.program.body {
        let Statement::ImportDeclaration(import) = stmt else {
            continue;
        };
        let mut info = ImportInfo {
            source: import.source.value.to_string(),
            default_local: None,
            named: Vec::new(),
        };
        if let Some(specifiers) = &import.specifiers {
            for spec in specifiers {
                match spec {
                    ImportDeclarationSpecifier::ImportDefaultSpecifier(d) => {
                        info.default_local = Some(d.local.name.to_string());
                    }
                    ImportDeclarationSpecifier::ImportSpecifier(s) => {
                        info.named
                            .push((s.imported.name().to_string(), s.local.name.to_string()));
                    }
                    ImportDeclarationSpecifier::ImportNamespaceSpecifier(_) => {}
                }
            }
        }
        out.push(info);
    }
    out
}

/// A tool an agent module imports: the module specifier and the local binding.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ToolEdge {
    pub source: String,
    pub local: String,
}

/// Extract the tools an agent module imports — imports whose specifier contains
/// `tool_marker` (e.g. `"/tools/"` or `"tools/"`). These are the code-split
/// boundaries `@vibe/build` turns into lazily-loaded chunks.
pub fn tool_edges(agent_source: &str, tool_marker: &str) -> Vec<ToolEdge> {
    imports(agent_source)
        .into_iter()
        .filter(|i| i.source.contains(tool_marker))
        .filter_map(|i| {
            i.default_local.map(|local| ToolEdge {
                source: i.source,
                local,
            })
        })
        .collect()
}

/// JSON form of [`tool_edges`], for the napi/JS bridge.
pub fn tool_edges_json(agent_source: &str, tool_marker: &str) -> String {
    serde_json::to_string(&tool_edges(agent_source, tool_marker))
        .unwrap_or_else(|_| "[]".to_string())
}

/// The bundler version (also exported to JS).
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests;
