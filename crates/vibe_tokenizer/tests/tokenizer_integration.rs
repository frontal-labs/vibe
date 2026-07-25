use vibe_tokenizer::{count_messages, count_text, Family};

#[test]
fn count_text_with_heuristic_matches_chars_over_4() {
    assert_eq!(count_text("abcdefghijkl", Family::Heuristic), 3);
    assert_eq!(count_text("abcde", Family::Heuristic), 2);
}

#[test]
fn count_text_with_openai_uses_bpe() {
    let n = count_text("hello world", Family::OpenAi);
    assert_eq!(n, 2);
}

#[test]
fn count_text_with_anthropic_uses_bpe() {
    let n = count_text("hello world", Family::Anthropic);
    assert_eq!(n, 2);
}

#[test]
fn count_messages_with_valid_json_array_returns_per_message_counts() {
    let json = r#"[
        {"role":"user","content":"hello world"},
        {"role":"assistant","content":"hi there"}
    ]"#;
    let counts = count_messages(json, Family::OpenAi);
    assert_eq!(counts.len(), 2);
    assert!(counts[0] > 0);
    assert!(counts[1] > 0);
}

#[test]
fn count_messages_with_empty_array_returns_empty_vec() {
    let counts = count_messages("[]", Family::OpenAi);
    assert!(counts.is_empty());
}

#[test]
fn count_messages_with_tool_use_and_tool_result_blocks_counts_them() {
    let json = r#"[
        {"role":"assistant","content":[
            {"type":"toolUse","id":"t1","name":"get_order","input":{"id":"A-123"}}
        ]},
        {"role":"user","content":[
            {"type":"toolResult","toolUseId":"t1","content":"order is shipped","isError":false}
        ]}
    ]"#;
    let counts = count_messages(json, Family::OpenAi);
    assert_eq!(counts.len(), 2);
    assert!(counts[0] > 0);
    assert!(counts[1] > 0);
}

#[test]
fn count_messages_with_malformed_json_returns_empty_vec() {
    assert!(count_messages("not json", Family::OpenAi).is_empty());
    assert!(count_messages("{}", Family::OpenAi).is_empty());
}

#[test]
fn family_parse_openai_returns_open_ai() {
    assert_eq!(Family::parse("openai"), Family::OpenAi);
}

#[test]
fn family_parse_anthropic_returns_anthropic() {
    assert_eq!(Family::parse("anthropic"), Family::Anthropic);
}

#[test]
fn family_parse_unknown_returns_heuristic() {
    assert_eq!(Family::parse("unknown"), Family::Heuristic);
    assert_eq!(Family::parse("gpt-4"), Family::Heuristic);
}
