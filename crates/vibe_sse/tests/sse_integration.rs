use vibe_sse::{fold, fold_json};

fn body(frames: &[&str]) -> String {
    let mut out = String::new();
    for frame in frames {
        out.push_str("data: ");
        out.push_str(frame);
        out.push_str("\n\n");
    }
    out.push_str("data: [DONE]\n\n");
    out
}

#[test]
fn fold_on_simple_text_stream_returns_events() {
    let sse = body(&[
        r#"{"model":"gpt-4o","choices":[{"delta":{"content":"Hel"}}]}"#,
        r#"{"choices":[{"delta":{"content":"lo "}}]}"#,
        r#"{"choices":[{"delta":{"content":"world"}}]}"#,
        r#"{"choices":[{"delta":{},"finish_reason":"stop"}]}"#,
    ]);
    let result = fold(&sse);
    let json = serde_json::to_value(&result).unwrap();
    let events = json["events"].as_array().unwrap();
    assert_eq!(events.len(), 3);
    assert_eq!(events[0]["delta"], "Hel");
    assert_eq!(events[1]["delta"], "lo ");
    assert_eq!(events[2]["delta"], "world");
    assert_eq!(json["response"]["content"][0]["text"], "Hello world");
    assert_eq!(json["response"]["stopReason"], "end_turn");
    assert_eq!(json["response"]["model"], "gpt-4o");
}

#[test]
fn fold_combines_tool_call_pieces_by_index() {
    let sse = body(&[
        r#"{"model":"gpt-4o","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_"}}]}}]}"#,
        r#"{"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_2","function":{"name":"lookup"}}]}}]}"#,
        r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"order","arguments":"{\"id\":"}}]}}]}"#,
        r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"A-1\"}"}}]}}]}"#,
        r#"{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}"#,
    ]);
    let json = fold_json(&sse);
    assert!(json.contains("\"stopReason\":\"tool_use\""));
    assert!(json.contains("\"name\":\"get_order\""));
    assert!(json.contains("\"id\":\"call_1\""));
    assert!(json.contains("\"name\":\"lookup\""));
    assert!(json.contains("\"id\":\"call_2\""));
    assert!(json.contains("\"input\":{\"id\":\"A-1\"}"));
}

#[test]
fn fold_with_malformed_frames_skips_them() {
    let sse = "data: not valid json\n\ndata: [DONE]\n\n";
    let result = fold(sse);
    let json = serde_json::to_value(&result).unwrap();
    assert!(json["events"].as_array().unwrap().is_empty());
}

#[test]
fn fold_with_done_termination_works_correctly() {
    let sse = body(&[
        r#"{"model":"gpt-4o","choices":[{"delta":{"content":"done"}}]}"#,
    ]);
    let result = fold(&sse);
    let json = serde_json::to_value(&result).unwrap();
    assert_eq!(json["events"].as_array().unwrap().len(), 1);
    assert_eq!(json["response"]["content"][0]["text"], "done");
    assert_eq!(json["response"]["stopReason"], "end_turn");
}

#[test]
fn fold_json_returns_valid_json() {
    let sse = body(&[
        r#"{"model":"gpt-4o","choices":[{"delta":{"content":"hi"}}]}"#,
        r#"{"choices":[{"delta":{},"finish_reason":"stop"}]}"#,
    ]);
    let json = fold_json(&sse);
    let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert!(parsed.get("events").is_some());
    assert!(parsed.get("response").is_some());
}

#[test]
fn fold_captures_usage_data_when_present() {
    let sse = body(&[
        r#"{"model":"gpt-4","choices":[{"delta":{"content":"x"}}],"usage":{"prompt_tokens":15,"completion_tokens":5}}"#,
        r#"{"choices":[{"delta":{},"finish_reason":"stop"}]}"#,
    ]);
    let json = fold_json(&sse);
    assert!(json.contains("\"inputTokens\":15"));
    assert!(json.contains("\"outputTokens\":5"));
}

#[test]
fn fold_with_real_world_style_chunked_responses() {
    let chunks = [
        r#"{"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o-2024-08-06","choices":[{"index":0,"delta":{"role":"assistant","content":"","tool_calls":[{"index":0,"id":"call_xyz","type":"function","function":{"name":"search_knowledge"}}]},"finish_reason":null}]}"#,
        r#"{"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o-2024-08-06","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"query\":"}}]},"finish_reason":null}]}"#,
        r#"{"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o-2024-08-06","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"latest "}}]},"finish_reason":null}]}"#,
        r#"{"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o-2024-08-06","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"news\"}"}}]},"finish_reason":null}]}"#,
        r#"{"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o-2024-08-06","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}"#,
    ];
    let sse = body(&chunks);
    let json = fold_json(&sse);
    assert!(json.contains("\"stopReason\":\"tool_use\""));
    assert!(json.contains("\"name\":\"search_knowledge\""));
    assert!(json.contains("\"id\":\"call_xyz\""));
    assert!(json.contains("\"input\":{\"query\":\"latest news\"}"));
    assert!(json.contains("\"model\":\"gpt-4o-2024-08-06\""));
}
