//! Vibe semantic analysis — the checks a library cannot express.
//!
//! Over a parsed [`File`] and its [`SymbolTable`], the checker verifies:
//! `use` targets resolve, `model` references are in the catalog (with "did you
//! mean"), no tool is declared-but-never-used, at most one `config`, agent `use`
//! edges are acyclic, and tool parameter/return types are lowerable to a JSON
//! schema. See `docs/language/02-compiler.md#4-check`.
#![forbid(unsafe_code)]

use std::collections::{HashMap, HashSet};
use vibe_ast::{Decl, File, Ident, ModelDecl, ToolDecl, Value};
use vibe_binder::{SymbolKind, SymbolTable};
use vibe_diagnostics::{codes, Diagnostic};
use vibe_span::Span;

/// The known model ids (see `docs/specs/model-spec.md`).
const MODEL_CATALOG: &[&str] = &[
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    "claude-fable-5",
];

/// The known model ids, for tooling (completion, docs).
pub fn model_catalog() -> &'static [&'static str] {
    MODEL_CATALOG
}

pub fn check(src: &str, file: &File, symbols: &SymbolTable) -> Vec<Diagnostic> {
    let mut diags = Vec::new();

    check_duplicates(symbols, &mut diags);
    check_single_config(file, &mut diags);

    let mut used_tools: HashSet<&str> = HashSet::new();
    let mut agents: Vec<AgentNode> = Vec::new();

    for decl in &file.decls {
        match decl {
            Decl::Agent(a) => {
                let mut uses_agents: Vec<&str> = Vec::new();
                for member in &a.members {
                    match member {
                        vibe_ast::AgentMember::Model(id) => {
                            check_model_ref(id, symbols, &mut diags)
                        }
                        vibe_ast::AgentMember::Use(id) => {
                            resolve_use(id, symbols, &mut used_tools, &mut uses_agents, &mut diags)
                        }
                        _ => {}
                    }
                }
                agents.push(AgentNode {
                    name: a.name.text.as_str(),
                    span: a.name.span,
                    uses: uses_agents,
                });
            }
            Decl::Model(m) => check_model_decl(m, &mut diags),
            Decl::Tool(t) => check_tool_types(src, t, &mut diags),
            _ => {}
        }
    }

    check_dead_tools(file, &used_tools, &mut diags);
    check_cycles(&agents, &mut diags);

    diags.sort_by_key(|d| (d.span.lo, d.code.0));
    diags
}

fn check_duplicates(symbols: &SymbolTable, diags: &mut Vec<Diagnostic>) {
    for sym in symbols.duplicates() {
        diags.push(Diagnostic::error(
            codes::DUPLICATE_DECL,
            sym.span,
            format!("`{}` is already declared", sym.name),
        ));
    }
}

fn check_single_config(file: &File, diags: &mut Vec<Diagnostic>) {
    let mut seen = false;
    for decl in &file.decls {
        if let Decl::Config(c) = decl {
            if seen {
                diags.push(Diagnostic::error(
                    codes::MULTIPLE_CONFIG,
                    c.span,
                    "only one `config` block is allowed per project",
                ));
            }
            seen = true;
        }
    }
}

fn resolve_use<'a>(
    id: &'a Ident,
    symbols: &SymbolTable,
    used_tools: &mut HashSet<&'a str>,
    uses_agents: &mut Vec<&'a str>,
    diags: &mut Vec<Diagnostic>,
) {
    match symbols.lookup(&id.text) {
        Some(sym) => match sym.kind {
            SymbolKind::Tool => {
                used_tools.insert(id.text.as_str());
            }
            SymbolKind::Agent => uses_agents.push(id.text.as_str()),
            SymbolKind::Plugin => {}
            other => diags.push(Diagnostic::error(
                codes::UNRESOLVED_USE,
                id.span,
                format!(
                    "cannot `use` {} `{}` — only tools, sub-agents, and plugins can be used",
                    other.label(),
                    id.text
                ),
            )),
        },
        None => {
            let mut d = Diagnostic::error(
                codes::UNRESOLVED_USE,
                id.span,
                format!(
                    "no tool, sub-agent, or plugin named `{}` is in scope",
                    id.text
                ),
            );
            if let Some(sugg) =
                did_you_mean(&id.text, symbols.entries.iter().map(|e| e.name.as_str()))
            {
                d = d.with_help(format!("did you mean `{sugg}`?"));
            }
            diags.push(d);
        }
    }
}

fn check_model_ref(id: &Ident, symbols: &SymbolTable, diags: &mut Vec<Diagnostic>) {
    if MODEL_CATALOG.contains(&id.text.as_str()) {
        return;
    }
    // A bare word may also reference a named `model` declaration.
    if let Some(sym) = symbols.lookup(&id.text) {
        if sym.kind == SymbolKind::Model {
            return;
        }
    }
    let candidates = MODEL_CATALOG
        .iter()
        .copied()
        .chain(symbols.names_of(SymbolKind::Model));
    let mut d = Diagnostic::error(
        codes::UNKNOWN_MODEL,
        id.span,
        format!("unknown model `{}`", id.text),
    );
    if let Some(sugg) = did_you_mean(&id.text, candidates) {
        d = d.with_help(format!("did you mean `{sugg}`?"));
    }
    diags.push(d);
}

fn check_model_decl(m: &ModelDecl, diags: &mut Vec<Diagnostic>) {
    for f in &m.fields {
        if f.key.text == "id" {
            if let Value::Word(w) = &f.value {
                if !MODEL_CATALOG.contains(&w.text.as_str()) {
                    let mut d = Diagnostic::error(
                        codes::UNKNOWN_MODEL,
                        w.span,
                        format!("unknown model id `{}`", w.text),
                    );
                    if let Some(sugg) = did_you_mean(&w.text, MODEL_CATALOG.iter().copied()) {
                        d = d.with_help(format!("did you mean `{sugg}`?"));
                    }
                    diags.push(d);
                }
            }
        }
    }
}

fn check_tool_types(src: &str, t: &ToolDecl, diags: &mut Vec<Diagnostic>) {
    for p in &t.params {
        flag_unsupported_type(src, p.ty.0, "parameter", diags);
    }
    if let Some(ret) = t.ret {
        flag_unsupported_type(src, ret.0, "return", diags);
    }
}

fn flag_unsupported_type(src: &str, span: Span, what: &str, diags: &mut Vec<Diagnostic>) {
    let text = &src[span.lo as usize..span.hi as usize];
    // Conservative R3 rule: function types can't be lowered to a JSON schema.
    if text.contains("=>") {
        diags.push(Diagnostic::error(
            codes::UNSUPPORTED_TOOL_TYPE,
            span,
            format!("tool {what} type is not expressible as a JSON schema (function types aren't supported)"),
        ));
    }
}

fn check_dead_tools(file: &File, used_tools: &HashSet<&str>, diags: &mut Vec<Diagnostic>) {
    for decl in &file.decls {
        if let Decl::Tool(t) = decl {
            if !t.exported && !used_tools.contains(t.name.text.as_str()) {
                diags.push(Diagnostic::warning(
                    codes::DEAD_TOOL,
                    t.name.span,
                    format!("tool `{}` is never used by any agent", t.name.text),
                ));
            }
        }
    }
}

struct AgentNode<'a> {
    name: &'a str,
    span: Span,
    uses: Vec<&'a str>,
}

fn check_cycles(nodes: &[AgentNode], diags: &mut Vec<Diagnostic>) {
    let index: HashMap<&str, usize> = nodes.iter().enumerate().map(|(i, n)| (n.name, i)).collect();
    let mut state = vec![0u8; nodes.len()]; // 0 = unvisited, 1 = on stack, 2 = done
    let mut in_cycle = vec![false; nodes.len()];
    for i in 0..nodes.len() {
        if state[i] == 0 {
            dfs(i, nodes, &index, &mut state, &mut in_cycle);
        }
    }
    for (i, n) in nodes.iter().enumerate() {
        if in_cycle[i] {
            diags.push(Diagnostic::error(
                codes::USE_CYCLE,
                n.span,
                format!(
                    "agent `{}` is part of a `use` cycle (delegation must be acyclic and one level deep)",
                    n.name
                ),
            ));
        }
    }
}

fn dfs(
    u: usize,
    nodes: &[AgentNode],
    index: &HashMap<&str, usize>,
    state: &mut [u8],
    in_cycle: &mut [bool],
) {
    state[u] = 1;
    for &use_name in &nodes[u].uses {
        if let Some(&v) = index.get(use_name) {
            if state[v] == 1 {
                in_cycle[v] = true;
                in_cycle[u] = true;
            } else if state[v] == 0 {
                dfs(v, nodes, index, state, in_cycle);
            }
        }
    }
    state[u] = 2;
}

/// The nearest candidate within edit distance 3, for "did you mean" hints.
fn did_you_mean<'a>(name: &str, candidates: impl Iterator<Item = &'a str>) -> Option<String> {
    let mut best: Option<(usize, &str)> = None;
    for c in candidates {
        let d = levenshtein(name, c);
        if best.is_none_or(|(bd, _)| d < bd) {
            best = Some((d, c));
        }
    }
    best.filter(|(d, _)| *d > 0 && *d <= 3)
        .map(|(_, c)| c.to_string())
}

fn levenshtein(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut curr = vec![0usize; b.len() + 1];
    for (i, &ca) in a.iter().enumerate() {
        curr[0] = i + 1;
        for (j, &cb) in b.iter().enumerate() {
            let cost = if ca == cb { 0 } else { 1 };
            curr[j + 1] = (prev[j + 1] + 1).min(curr[j] + 1).min(prev[j] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[b.len()]
}

#[cfg(test)]
mod tests;
