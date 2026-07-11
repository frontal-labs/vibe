//! Codegen: AST → TypeScript that calls the `@vibe/*` runtime, plus a `.d.ts` and
//! a source map. This is where `.vibe` becomes runnable TypeScript.
//!
//! `tool` → `defineTool({ name, description, schema, execute })`, `agent` →
//! `createAgent({ ... })`, `config` → `defineConfig({ ... })`. Tool bodies and
//! type annotations are copied verbatim (they are already TypeScript). See
//! `docs/language/02-compiler.md#codegen-what-each-construct-emits`.
#![forbid(unsafe_code)]

mod lower;
mod sourcemap;

use sourcemap::LineMapping;
use vibe_ast::{AgentDecl, AgentMember, ConfigDecl, Decl, File, Ident, ModelDecl, ToolDecl, Value};
use vibe_span::{SourceFile, SourceId, Span};

#[derive(Debug, Default, Clone)]
pub struct Emit {
    pub typescript: String,
    pub declarations: String,
    pub source_map: String,
    /// `(generated line in `typescript`, source byte offset)` pairs, sorted by
    /// generated line — used to re-anchor `tsc` diagnostics back to `.vibe`.
    pub line_map: Vec<(u32, u32)>,
}

/// Emit TypeScript (+ `.d.ts` + source map) for a parsed file.
pub fn emit(src: &str, file: &File) -> Emit {
    let mut em = Emitter::new(src);
    em.emit_file(file);
    em.finish()
}

struct Emitter<'a> {
    src: &'a str,
    body: String,
    dts: String,
    /// (generated line within `body`, source byte offset) for the source map.
    marks: Vec<(u32, u32)>,
    need_zod: bool,
    need_define_tool: bool,
    need_create_agent: bool,
    need_define_config: bool,
}

impl<'a> Emitter<'a> {
    fn new(src: &'a str) -> Self {
        Self {
            src,
            body: String::new(),
            dts: String::new(),
            marks: Vec::new(),
            need_zod: false,
            need_define_tool: false,
            need_create_agent: false,
            need_define_config: false,
        }
    }

    fn slice(&self, span: Span) -> &'a str {
        &self.src[span.lo as usize..span.hi as usize]
    }

    /// The current generated line within `body` (0-based).
    fn cur_line(&self) -> u32 {
        self.body.bytes().filter(|&b| b == b'\n').count() as u32
    }

    fn mark(&mut self, src_off: u32) {
        self.marks.push((self.cur_line(), src_off));
    }

    fn emit_file(&mut self, file: &File) {
        for decl in &file.decls {
            match decl {
                Decl::Import(i) => {
                    self.mark(i.span.lo);
                    let text = self.slice(i.span).to_string();
                    self.body.push_str(&text);
                    self.body.push('\n');
                }
                Decl::Config(c) => self.emit_config(c),
                Decl::Model(m) => self.emit_model(m),
                Decl::Tool(t) => self.emit_tool(t),
                Decl::Agent(a) => self.emit_agent(a),
                Decl::Memory(m) => {
                    self.mark(m.span.lo);
                    self.body.push_str(&format!(
                        "// memory {} — not yet emitted (R4)\n\n",
                        m.name.text
                    ));
                }
                Decl::Plugin(p) => {
                    self.mark(p.span.lo);
                    self.body.push_str(&format!(
                        "// plugin {} — not yet emitted (R4)\n\n",
                        p.name.text
                    ));
                }
            }
        }
    }

    fn emit_tool(&mut self, t: &ToolDecl) {
        self.need_define_tool = true;
        self.need_zod = true;
        self.mark(t.span.lo);
        let name = &t.name.text;
        let export = if t.exported { "export " } else { "" };
        let schema = self.lower_params(t);
        let destructure = if t.params.is_empty() {
            "_input".to_string()
        } else {
            let names: Vec<&str> = t.params.iter().map(|p| p.name.text.as_str()).collect();
            format!("{{ {} }}", names.join(", "))
        };
        let ret = t
            .ret
            .map(|r| format!(": Promise<{}>", self.slice(r.0).trim()))
            .unwrap_or_default();
        let desc_line = t
            .doc
            .map(|d| {
                let text = self.slice(d).trim_start_matches('/').trim();
                format!("  description: \"{}\",\n", sourcemap::json_escape(text))
            })
            .unwrap_or_default();
        // Emit the header of the `defineTool` call, then the body on its own lines
        // (with a source mark per body line so `tsc` errors re-anchor precisely).
        self.body.push_str(&format!(
            "{export}const {name} = defineTool({{\n  name: \"{name}\",\n{desc_line}  schema: {schema},\n  async execute({destructure}, _ctx){ret} {{\n"
        ));
        self.emit_verbatim_body(t.body.0);
        self.body.push_str("  },\n})\n\n");
        if t.exported {
            self.dts.push_str(&format!(
                "export declare const {name}: import(\"@vibe/tools\").Tool;\n"
            ));
        }
    }

    /// Append a tool body verbatim, recording a source mark for each of its lines so
    /// downstream `tsc` diagnostics inside the body re-anchor to the right `.vibe`
    /// line.
    fn emit_verbatim_body(&mut self, span: Span) {
        let text = self.slice(span);
        let start_line = self.cur_line();
        let mut off = 0u32;
        for (i, seg) in text.split_inclusive('\n').enumerate() {
            self.marks.push((start_line + i as u32, span.lo + off));
            off += seg.len() as u32;
        }
        self.body.push_str(text);
        if !text.ends_with('\n') {
            self.body.push('\n');
        }
    }

    fn lower_params(&self, t: &ToolDecl) -> String {
        if t.params.is_empty() {
            return "z.object({})".to_string();
        }
        let fields: Vec<String> = t
            .params
            .iter()
            .map(|p| {
                let mut z = lower::lower_type(self.slice(p.ty.0));
                if let Some(d) = p.desc {
                    z = format!("{}.describe({})", z, self.slice(d));
                }
                format!("{}: {}", p.name.text, z)
            })
            .collect();
        format!("z.object({{ {} }})", fields.join(", "))
    }

    fn emit_agent(&mut self, a: &AgentDecl) {
        self.need_create_agent = true;
        self.mark(a.span.lo);
        let name = &a.name.text;
        let export = if a.exported { "export " } else { "" };
        let mut model = None;
        let mut lines: Vec<String> = Vec::new();
        let mut tools: Vec<String> = Vec::new();
        for member in &a.members {
            match member {
                AgentMember::Model(id) => model = Some(self.lower_model_ref(id)),
                AgentMember::Use(id) => tools.push(id.text.clone()),
                AgentMember::Field(f) => {
                    if matches!(f.key.text.as_str(), "system" | "effort") {
                        lines.push(format!("  {}: {}", f.key.text, self.lower_value(&f.value)));
                    }
                }
                AgentMember::Error(_) => {}
            }
        }
        let mut object = Vec::new();
        if let Some(m) = model {
            object.push(format!("  model: {m}"));
        }
        object.extend(lines);
        object.push(format!("  tools: [{}]", tools.join(", ")));
        self.body.push_str(&format!(
            "{export}const {name} = createAgent({{\n{}\n}})\n\n",
            object.join(",\n")
        ));
        self.dts.push_str(&format!(
            "export declare const {name}: import(\"@vibe/agent\").Agent;\n"
        ));
    }

    /// A model reference: a catalog id (has a `-`) becomes a string literal; a bare
    /// name references a `model` declaration by identifier.
    fn lower_model_ref(&self, id: &Ident) -> String {
        if id.text.contains('-') {
            format!("\"{}\"", id.text)
        } else {
            id.text.clone()
        }
    }

    fn emit_config(&mut self, c: &ConfigDecl) {
        self.need_define_config = true;
        self.mark(c.span.lo);
        let fields: Vec<String> = c
            .fields
            .iter()
            .map(|f| format!("  {}: {}", f.key.text, self.lower_value(&f.value)))
            .collect();
        self.body.push_str(&format!(
            "export const config = defineConfig({{\n{}\n}})\n\n",
            fields.join(",\n")
        ));
    }

    fn emit_model(&mut self, m: &ModelDecl) {
        self.mark(m.span.lo);
        let fields: Vec<String> = m
            .fields
            .iter()
            .map(|f| format!("  {}: {}", f.key.text, self.lower_value(&f.value)))
            .collect();
        self.body.push_str(&format!(
            "const {} = {{\n{}\n}}\n\n",
            m.name.text,
            fields.join(",\n")
        ));
    }

    fn lower_value(&self, v: &Value) -> String {
        match v {
            Value::Str(s) => lower::string_to_template(self.slice(*s)),
            Value::Number(s) => self.slice(*s).to_string(),
            Value::Word(w) => format!("\"{}\"", w.text),
            Value::Block(_) => "{}".to_string(),
        }
    }

    fn finish(self) -> Emit {
        let mut header = String::new();
        if self.need_zod {
            header.push_str("import { z } from \"zod\"\n");
        }
        if self.need_define_tool {
            header.push_str("import { defineTool } from \"@vibe/tools\"\n");
        }
        if self.need_create_agent {
            header.push_str("import { createAgent } from \"@vibe/agent\"\n");
        }
        if self.need_define_config {
            header.push_str("import { defineConfig } from \"@vibe/config\"\n");
        }
        if !header.is_empty() {
            header.push('\n');
        }
        let header_lines = header.bytes().filter(|&b| b == b'\n').count() as u32;

        let typescript = format!("{header}{}", self.body);
        let total_lines = typescript.split('\n').count() as u32;

        let sf = SourceFile::new(SourceId(0), "input.vibe", self.src);
        let marks: Vec<LineMapping> = self
            .marks
            .iter()
            .map(|&(body_line, off)| {
                let loc = sf.location(off);
                LineMapping {
                    gen_line: body_line + header_lines,
                    src_line: loc.line - 1,
                    src_col: loc.col - 1,
                }
            })
            .collect();
        let mappings = sourcemap::build_mappings(total_lines, &marks);
        let source_map =
            sourcemap::source_map_json("input.vibe.ts", "input.vibe", self.src, &mappings);

        let mut line_map: Vec<(u32, u32)> = self
            .marks
            .iter()
            .map(|&(body_line, off)| (body_line + header_lines, off))
            .collect();
        line_map.sort_unstable();

        Emit {
            typescript,
            declarations: self.dts,
            source_map,
            line_map,
        }
    }
}

#[cfg(test)]
mod tests;
