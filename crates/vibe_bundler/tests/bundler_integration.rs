use vibe_bundler::{imports, tool_edges, tool_edges_json};

#[test]
fn imports_on_empty_source_returns_empty() {
    let result = imports("");
    assert!(result.is_empty());
}

#[test]
fn imports_on_source_with_no_imports_returns_empty() {
    let source = r#"
        const x = 42;
        export function greet() { return "hello"; }
    "#;
    let result = imports(source);
    assert!(result.is_empty());
}

#[test]
fn imports_finds_relative_imports() {
    let source = r#"
        import getOrder from "../tools/get-order"
        import lookup from "../tools/lookup"
    "#;
    let result = imports(source);
    assert_eq!(result.len(), 2);
    assert!(result.iter().any(|i| i.source == "../tools/get-order"));
    assert!(result.iter().any(|i| i.source == "../tools/lookup"));
}

#[test]
fn imports_finds_named_and_default_imports() {
    let source = r#"
        import { z } from "zod"
        import { createAgent, type Agent } from "vibe/agent"
        import getOrder from "../tools/get-order"
    "#;
    let result = imports(source);
    assert_eq!(result.len(), 3);

    // named import from "zod"
    let zod = result.iter().find(|i| i.source == "zod").unwrap();
    assert!(zod.default_local.is_none());
    assert!(zod.named.iter().any(|(imported, local)| imported == "z" && local == "z"));

    // named imports from "vibe/agent"
    let agent = result.iter().find(|i| i.source == "vibe/agent").unwrap();
    assert!(agent.named.iter().any(|(imported, _)| imported == "createAgent"));

    // default import
    let get_order = result.iter().find(|i| i.source == "../tools/get-order").unwrap();
    assert_eq!(get_order.default_local.as_deref(), Some("getOrder"));
}

#[test]
fn tool_edges_finds_tool_imports_matching_marker() {
    let source = r#"
        import { createAgent } from "vibe/agent"
        import getOrder from "../tools/get-order"
        import lookup from "../tools/lookup"
        import { z } from "zod"
    "#;
    let edges = tool_edges(source, "/tools/");
    assert_eq!(edges.len(), 2);
    assert_eq!(edges[0].source, "../tools/get-order");
    assert_eq!(edges[0].local, "getOrder");
    assert_eq!(edges[1].local, "lookup");
}

#[test]
fn tool_edges_no_match_returns_empty() {
    let source = r#"import { z } from "zod""#;
    let edges = tool_edges(source, "/tools/");
    assert!(edges.is_empty());
}

#[test]
fn tool_edges_json_returns_valid_json() {
    let source = r#"
        import getOrder from "../tools/get-order"
        import { z } from "zod"
    "#;
    let json = tool_edges_json(source, "/tools/");
    assert!(json.starts_with('['));
    assert!(json.ends_with(']'));
    assert!(json.contains("get-order"));
    assert!(json.contains("getOrder"));

    // Verify it's valid JSON with expected content
    let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert_eq!(parsed.as_array().unwrap().len(), 1);
}

#[test]
fn imports_handles_mixed_multi_line_styles() {
    let source = r#"
        // default import
        import fs from "node:fs"

        // multi-line named imports
        import {
            readFile,
            writeFile
        } from "node:fs/promises"

        /* mixed */
        import path, { resolve, join } from "node:path"

        // type-only import
        import type { Options } from "../types"
    "#;
    let result = imports(source);
    assert_eq!(result.len(), 4);

    let node_fs = result.iter().find(|i| i.source == "node:fs").unwrap();
    assert_eq!(node_fs.default_local.as_deref(), Some("fs"));

    let promises = result.iter().find(|i| i.source == "node:fs/promises").unwrap();
    assert!(promises.named.iter().any(|(imported, _)| imported == "readFile"));
    assert!(promises.named.iter().any(|(imported, _)| imported == "writeFile"));

    let node_path = result.iter().find(|i| i.source == "node:path").unwrap();
    assert_eq!(node_path.default_local.as_deref(), Some("path"));
    assert!(node_path.named.iter().any(|(imported, _)| imported == "resolve"));
    assert!(node_path.named.iter().any(|(imported, _)| imported == "join"));
}
