use super::*;

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
fn folds_text_deltas_in_order() {
    let sse = body(&[
        r#"{"model":"gpt-4o","choices":[{"delta":{"content":"Hel"}}]}"#,
        r#"{"choices":[{"delta":{"content":"lo"}}]}"#,
        r#"{"choices":[{"delta":{},"finish_reason":"stop"}]}"#,
    ]);
    let result = fold(&sse);
    assert_eq!(result.events.len(), 2);
    assert_eq!(
        result.events[0],
        StreamEvent::Text {
            delta: "Hel".to_string()
        }
    );
    let json = fold_json(&sse);
    assert!(json.contains("\"text\":\"Hello\""));
    assert!(json.contains("\"stopReason\":\"end_turn\""));
    assert!(json.contains("\"model\":\"gpt-4o\""));
}

#[test]
fn concatenates_piecewise_tool_calls_by_index() {
    let sse = body(&[
        r#"{"model":"gpt-4o","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_"}}]}}]}"#,
        r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"order","arguments":"{\"id\":"}}]}}]}"#,
        r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"A-1\"}"}}]}}]}"#,
        r#"{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}"#,
    ]);
    let json = fold_json(&sse);
    assert!(json.contains("\"stopReason\":\"tool_use\""));
    assert!(json.contains("\"name\":\"get_order\""));
    assert!(json.contains("\"id\":\"call_1\""));
    // The concatenated arguments parse into a real object.
    assert!(json.contains("\"input\":{\"id\":\"A-1\"}"));
}

#[test]
fn malformed_arguments_become_empty_object() {
    let sse = body(&[
        r#"{"model":"m","choices":[{"delta":{"tool_calls":[{"index":0,"id":"c","function":{"name":"f","arguments":"{bad"}}]}}]}"#,
        r#"{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}"#,
    ]);
    let json = fold_json(&sse);
    assert!(json.contains("\"input\":{}"));
}

#[test]
fn skips_done_comments_and_malformed_frames() {
    let mut sse = String::from(": a comment line\n\n");
    sse.push_str("data: {not json}\n\n");
    sse.push_str(
        r#"data: {"model":"m","choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}"#,
    );
    sse.push_str("\n\ndata: [DONE]\n\n");
    let result = fold(&sse);
    assert_eq!(result.events.len(), 1);
    assert_eq!(
        result.events[0],
        StreamEvent::Text {
            delta: "ok".to_string()
        }
    );
}

#[test]
fn reads_usage_and_maps_length_to_max_tokens() {
    let sse = body(&[
        r#"{"model":"m","choices":[{"delta":{"content":"x"}}],"usage":{"prompt_tokens":10,"completion_tokens":3}}"#,
        r#"{"choices":[{"delta":{},"finish_reason":"length"}]}"#,
    ]);
    let json = fold_json(&sse);
    assert!(json.contains("\"inputTokens\":10"));
    assert!(json.contains("\"outputTokens\":3"));
    assert!(json.contains("\"stopReason\":\"max_tokens\""));
}
