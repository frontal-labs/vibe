//! Emitter tests: golden `insta` snapshot of the generated TypeScript, structural
//! assertions, `.d.ts`, and source-map validity.

use super::emit;

fn compile(src: &str) -> super::Emit {
    let p = vibe_parser::parse(src);
    assert!(
        p.diagnostics.is_empty(),
        "parse errors: {:?}",
        p.diagnostics
    );
    emit(src, &p.file)
}

const CANONICAL: &str = "\
import { db } from \"./db\"

config { name \"support-bot\" ; provider anthropic }

/// Look up an order.
tool GetOrder(orderId: string @desc(\"the order id\")) -> OrderStatus { return db.find(orderId) }

agent Support {
  model claude-opus-4-8
  system \"Be concise. Use tools.\"
  use GetOrder
}
";

#[test]
fn snapshot_generated_typescript() {
    insta::assert_snapshot!(compile(CANONICAL).typescript);
}

#[test]
fn tool_lowers_to_definetool_with_zod_schema() {
    let ts =
        compile("tool T(orderId: string, count: number) { work() } agent A { use T }").typescript;
    assert!(ts.contains("import { z } from \"zod\""));
    assert!(ts.contains("import { defineTool } from \"@vibe/tools\""));
    assert!(ts.contains("const T = defineTool({"));
    assert!(ts.contains("schema: z.object({ orderId: z.string(), count: z.number() })"));
    assert!(ts.contains("async execute({ orderId, count }, _ctx)"));
}

#[test]
fn param_description_becomes_describe() {
    let ts = compile("tool T(id: string @desc(\"the id\")) { x } agent A { use T }").typescript;
    assert!(ts.contains("z.string().describe(\"the id\")"));
}

#[test]
fn return_type_annotates_execute() {
    let ts = compile("tool T(id: string) -> OrderStatus { x } agent A { use T }").typescript;
    assert!(ts.contains("async execute({ id }, _ctx): Promise<OrderStatus>"));
}

#[test]
fn agent_lowers_to_createagent_with_string_model_and_template_prompt() {
    let ts = compile("tool T(x: string) { x } agent Support { model claude-opus-4-8 system \"Hi ${name}\" use T }").typescript;
    assert!(ts.contains("import { createAgent } from \"@vibe/agent\""));
    assert!(ts.contains("const Support = createAgent({"));
    assert!(ts.contains("model: \"claude-opus-4-8\""));
    // Prompt becomes a template literal so `${name}` interpolates.
    assert!(ts.contains("system: `Hi ${name}`"));
    assert!(ts.contains("tools: [T]"));
}

#[test]
fn named_model_reference_is_an_identifier() {
    let ts = compile(
        "model Fast { id claude-haiku-4-5 } agent A { model Fast use T } tool T(x: string) { x }",
    )
    .typescript;
    assert!(ts.contains("model: Fast")); // not quoted — references the const
    assert!(ts.contains("const Fast = {"));
}

#[test]
fn config_lowers_to_defineconfig() {
    let ts = compile("config { name \"bot\" ; provider anthropic }").typescript;
    assert!(ts.contains("import { defineConfig } from \"@vibe/config\""));
    assert!(ts.contains("export const config = defineConfig({"));
    assert!(ts.contains("provider: \"anthropic\""));
}

#[test]
fn declarations_export_tools_and_agents() {
    let dts = compile("export tool GetOrder(x: string) { x } agent Support { use GetOrder }")
        .declarations;
    assert!(dts.contains("export declare const GetOrder: import(\"@vibe/tools\").Tool;"));
    assert!(dts.contains("export declare const Support: import(\"@vibe/agent\").Agent;"));
}

#[test]
fn source_map_is_valid_v3() {
    let map = compile(CANONICAL).source_map;
    assert!(map.contains("\"version\":3"));
    assert!(map.contains("\"sources\":[\"input.vibe\"]"));
    assert!(map.contains("\"mappings\":\""));
    // sourcesContent embeds the original .vibe.
    assert!(map.contains("import { db }"));
}
