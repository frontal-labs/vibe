use super::*;

const AGENT: &str = r#"
import { createAgent } from "vibe/agent"
import getOrder from "../tools/get-order"
import lookup from "../tools/lookup"
import { z } from "zod"

export default createAgent({ tools: [getOrder, lookup] })
"#;

#[test]
fn extracts_all_imports() {
    let imps = imports(AGENT);
    assert_eq!(imps.len(), 4);
    let sources: Vec<_> = imps.iter().map(|i| i.source.as_str()).collect();
    assert!(sources.contains(&"vibe/agent"));
    assert!(sources.contains(&"../tools/get-order"));
}

#[test]
fn tool_edges_finds_only_tool_imports() {
    let edges = tool_edges(AGENT, "/tools/");
    assert_eq!(edges.len(), 2);
    assert_eq!(edges[0].source, "../tools/get-order");
    assert_eq!(edges[0].local, "getOrder");
    assert_eq!(edges[1].local, "lookup");
    // vibe/agent and zod are not tools
    assert!(!edges.iter().any(|e| e.source == "vibe/agent"));
}

#[test]
fn tool_edges_json_round_trips() {
    let json = tool_edges_json(AGENT, "/tools/");
    assert!(json.contains("get-order"));
    assert!(json.contains("\"local\":\"getOrder\""));
}

#[test]
fn version_is_nonempty() {
    assert!(!version().is_empty());
}
