//! Canonical `.vibe` formatter (idempotent, like `rustfmt`/`gofmt`).
//!
//! Parses to the AST and pretty-prints a canonical form: one declaration per
//! block, 2-space indent, one member/field per line, `,`-separated params. Tool
//! bodies, type annotations, and plugin bodies are **kept verbatim** (they are
//! TypeScript — not this formatter's job). Doc comments are preserved.
//!
//! Safety: if the source doesn't parse cleanly, it is returned **unchanged** (never
//! mangle invalid input). Known gap: free-standing (non-doc) comments are not yet
//! re-attached, so they may be dropped — see Phase R10 notes.
#![forbid(unsafe_code)]

use vibe_ast::{AgentDecl, AgentMember, Decl, Field, File, ModelDecl, ToolDecl, Value};
use vibe_span::Span;

/// Format `.vibe` source into its canonical shape. Idempotent.
pub fn format(src: &str) -> String {
    let parse = vibe_parser::parse(src);
    if !parse.diagnostics.is_empty() {
        return src.to_string(); // don't reformat sources with parse errors
    }
    let mut p = Printer {
        src,
        out: String::new(),
    };
    p.file(&parse.file);
    p.out
}

struct Printer<'a> {
    src: &'a str,
    out: String,
}

impl<'a> Printer<'a> {
    fn slice(&self, span: Span) -> &'a str {
        &self.src[span.lo as usize..span.hi as usize]
    }

    fn file(&mut self, f: &File) {
        for (i, decl) in f.decls.iter().enumerate() {
            if i > 0 {
                self.out.push('\n'); // one blank line between declarations
            }
            self.decl(decl);
        }
    }

    fn decl(&mut self, d: &Decl) {
        match d {
            Decl::Import(i) => {
                self.out.push_str(self.slice(i.span).trim());
                self.out.push('\n');
            }
            Decl::Config(c) => self.fields_block("config", None, false, &c.fields),
            Decl::Model(m) => self.model(m),
            Decl::Memory(m) => self.fields_block("memory", Some(&m.name.text), false, &m.fields),
            Decl::Tool(t) => self.tool(t),
            Decl::Agent(a) => self.agent(a),
            Decl::Plugin(p) => {
                let export = if p.exported { "export " } else { "" };
                let body = self.slice(p.body.0).to_string();
                self.out.push_str(&format!(
                    "{export}plugin {} {}\n",
                    p.name.text,
                    wrap_body(&body)
                ));
            }
        }
    }

    fn model(&mut self, m: &ModelDecl) {
        self.fields_block("model", Some(&m.name.text), m.exported, &m.fields);
    }

    fn fields_block(&mut self, kw: &str, name: Option<&str>, exported: bool, fields: &[Field]) {
        let export = if exported { "export " } else { "" };
        let header = match name {
            Some(n) => format!("{export}{kw} {n}"),
            None => format!("{export}{kw}"),
        };
        if fields.is_empty() {
            self.out.push_str(&format!("{header} {{}}\n"));
            return;
        }
        self.out.push_str(&format!("{header} {{\n"));
        for f in fields {
            self.out
                .push_str(&format!("  {} {}\n", f.key.text, self.value(&f.value)));
        }
        self.out.push_str("}\n");
    }

    fn tool(&mut self, t: &ToolDecl) {
        if let Some(doc) = t.doc {
            self.out.push_str(self.slice(doc).trim());
            self.out.push('\n');
        }
        let export = if t.exported { "export " } else { "" };
        let params: Vec<String> = t
            .params
            .iter()
            .map(|p| {
                let mut s = format!("{}: {}", p.name.text, self.slice(p.ty.0).trim());
                if let Some(d) = p.desc {
                    s.push_str(&format!(" @desc({})", self.slice(d)));
                }
                s
            })
            .collect();
        let ret = t
            .ret
            .map(|r| format!(" -> {}", self.slice(r.0).trim()))
            .unwrap_or_default();
        let body = self.slice(t.body.0).to_string();
        self.out.push_str(&format!(
            "{export}tool {}({}){} {}\n",
            t.name.text,
            params.join(", "),
            ret,
            wrap_body(&body)
        ));
    }

    fn agent(&mut self, a: &AgentDecl) {
        if let Some(doc) = a.doc {
            self.out.push_str(self.slice(doc).trim());
            self.out.push('\n');
        }
        let export = if a.exported { "export " } else { "" };
        if a.members.is_empty() {
            self.out
                .push_str(&format!("{export}agent {} {{}}\n", a.name.text));
            return;
        }
        self.out
            .push_str(&format!("{export}agent {} {{\n", a.name.text));
        for m in &a.members {
            match m {
                AgentMember::Model(id) => self.out.push_str(&format!("  model {}\n", id.text)),
                AgentMember::Use(id) => self.out.push_str(&format!("  use {}\n", id.text)),
                AgentMember::Field(f) => {
                    self.out
                        .push_str(&format!("  {} {}\n", f.key.text, self.value(&f.value)))
                }
                AgentMember::Error(_) => {}
            }
        }
        self.out.push_str("}\n");
    }

    fn value(&self, v: &Value) -> String {
        match v {
            Value::Word(w) => w.text.clone(),
            Value::Str(s) | Value::Number(s) => self.slice(*s).to_string(),
            Value::Block(s) => format!("{{{}}}", self.slice(*s)),
        }
    }
}

/// Wrap a tool/plugin body: single-line bodies are tidied to `{ body }`;
/// multi-line bodies are kept verbatim between braces.
fn wrap_body(body: &str) -> String {
    if body.contains('\n') {
        format!("{{{body}}}")
    } else {
        format!("{{ {} }}", body.trim())
    }
}

#[cfg(test)]
mod tests;
