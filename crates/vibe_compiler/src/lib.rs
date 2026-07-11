//! The compiler façade — wires lex → parse → bind → check → emit and renders
//! diagnostics. This is the library the `vibe` CLI, the LSP, and the Node/WASM
//! bindings all build on. See `docs/language/02-compiler.md`.
#![forbid(unsafe_code)]

pub mod tscheck;

pub use vibe_diagnostics::{Diagnostic, Severity};
pub use vibe_emit::Emit;

use vibe_span::{SourceFile, SourceId};

#[derive(Debug, Default, Clone)]
pub struct Compilation {
    pub outputs: Vec<Emit>,
    pub diagnostics: Vec<Diagnostic>,
}

impl Compilation {
    pub fn error_count(&self) -> usize {
        self.diagnostics
            .iter()
            .filter(|d| d.severity == Severity::Error)
            .count()
    }

    pub fn warning_count(&self) -> usize {
        self.diagnostics
            .iter()
            .filter(|d| d.severity == Severity::Warning)
            .count()
    }

    pub fn has_errors(&self) -> bool {
        self.error_count() > 0
    }
}

/// Compile a single `.vibe` source string through the whole front end. Runs every
/// stage — even on errors — so partial output and all diagnostics are available.
pub fn compile(src: &str) -> Compilation {
    let parse = vibe_parser::parse(src);
    let symbols = vibe_binder::bind(&parse.file);
    let mut diagnostics = parse.diagnostics;
    diagnostics.extend(vibe_checker::check(src, &parse.file, &symbols));
    diagnostics.sort_by_key(|d| (d.span.lo, d.code.0));
    let outputs = vec![vibe_emit::emit(src, &parse.file)];
    Compilation {
        outputs,
        diagnostics,
    }
}

/// Render diagnostics as human-readable lines anchored to `name:line:col`.
pub fn render_diagnostics(name: &str, src: &str, diagnostics: &[Diagnostic]) -> String {
    let sf = SourceFile::new(SourceId(0), name, src);
    let mut out = String::new();
    for d in diagnostics {
        let loc = sf.location(d.span.lo);
        let sev = match d.severity {
            Severity::Error => "error",
            Severity::Warning => "warning",
            Severity::Info => "info",
        };
        out.push_str(&format!(
            "{}:{}:{}  {} {}  {}\n",
            name,
            loc.line,
            loc.col,
            sev,
            d.display_code(),
            d.message
        ));
        if let Some(help) = &d.help {
            out.push_str(&format!("    help: {help}\n"));
        }
    }
    out
}

/// Compile `.vibe` and return a JSON document (for the Node/WASM bindings):
/// `{ typescript, declarations, sourceMap, hasErrors, diagnostics: [...] }`.
pub fn compile_json(src: &str) -> String {
    let comp = compile(src);
    let emit = &comp.outputs[0];
    format!(
        "{{\"typescript\":\"{}\",\"declarations\":\"{}\",\"sourceMap\":{},\"hasErrors\":{},\"diagnostics\":{}}}",
        json_escape(&emit.typescript),
        json_escape(&emit.declarations),
        emit.source_map, // already a JSON document
        comp.has_errors(),
        diagnostics_json(src, &comp.diagnostics)
    )
}

/// Type-check `.vibe` and return `{ errorCount, warningCount, diagnostics }` JSON.
pub fn check_json(src: &str) -> String {
    let comp = compile(src);
    format!(
        "{{\"errorCount\":{},\"warningCount\":{},\"diagnostics\":{}}}",
        comp.error_count(),
        comp.warning_count(),
        diagnostics_json(src, &comp.diagnostics)
    )
}

fn diagnostics_json(src: &str, diagnostics: &[Diagnostic]) -> String {
    let sf = SourceFile::new(SourceId(0), "input.vibe", src);
    let items: Vec<String> = diagnostics
        .iter()
        .map(|d| {
            let loc = sf.location(d.span.lo);
            let severity = match d.severity {
                Severity::Error => "error",
                Severity::Warning => "warning",
                Severity::Info => "info",
            };
            let help = match &d.help {
                Some(h) => format!("\"{}\"", json_escape(h)),
                None => "null".to_string(),
            };
            format!(
                "{{\"code\":\"{}\",\"severity\":\"{}\",\"line\":{},\"col\":{},\"message\":\"{}\",\"help\":{}}}",
                json_escape(&d.display_code()),
                severity,
                loc.line,
                loc.col,
                json_escape(&d.message),
                help
            )
        })
        .collect();
    format!("[{}]", items.join(","))
}

fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compile_json_serializes_outputs_and_diagnostics() {
        let json = compile_json("tool T(x: string) { x } agent A { model claude-opus-4-8 use T }");
        assert!(json.contains("defineTool"));
        assert!(json.contains("\"hasErrors\":false"));
        assert!(json.contains("\"diagnostics\":[]"));
    }

    #[test]
    fn check_json_reports_located_diagnostics() {
        let json = check_json("agent A { use Ghost }");
        assert!(json.contains("\"errorCount\":1"));
        assert!(json.contains("VB2100"));
        assert!(json.contains("\"line\":1"));
    }

    #[test]
    fn compile_empty_runs_the_pipeline() {
        let c = compile("");
        assert!(c.diagnostics.is_empty());
        assert_eq!(c.outputs.len(), 1);
        assert!(!c.has_errors());
    }

    #[test]
    fn valid_program_emits_typescript_with_no_errors() {
        let c = compile("tool T(x: string) { x } agent A { model claude-opus-4-8 use T }");
        assert!(!c.has_errors(), "diags: {:?}", c.diagnostics);
        assert!(c.outputs[0].typescript.contains("defineTool"));
    }

    #[test]
    fn errors_are_counted_and_rendered_with_location() {
        let c = compile("agent A { use Ghost }");
        assert!(c.has_errors());
        let rendered = render_diagnostics("main.vibe", "agent A { use Ghost }", &c.diagnostics);
        assert!(rendered.contains("main.vibe:1:"));
        assert!(rendered.contains("VB2100"));
    }
}
