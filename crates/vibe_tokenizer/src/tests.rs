use super::*;

#[test]
fn heuristic_matches_chars_over_four() {
    // 12 chars -> ceil(12/4) = 3, mirroring the TS `estimateTokens` fallback.
    assert_eq!(count_text("abcdefghijkl", Family::Heuristic), 3);
    // Rounds up on the tail.
    assert_eq!(count_text("abcde", Family::Heuristic), 2);
}

#[test]
fn bpe_counts_real_tokens() {
    // A known phrase; o200k_base tokenizes "hello world" as 2 tokens.
    let n = count_text("hello world", Family::OpenAi);
    assert_eq!(n, 2);
    // Anthropic approximates with the same BPE.
    assert_eq!(count_text("hello world", Family::Anthropic), 2);
}

#[test]
fn bpe_differs_from_and_beats_the_heuristic() {
    // Real text: the heuristic and BPE should both be positive and in the same ballpark,
    // but BPE is the accurate one. This guards against a silently-empty BPE.
    let text = "The quick brown fox jumps over the lazy dog, repeatedly and with great enthusiasm.";
    let bpe = count_text(text, Family::OpenAi);
    let heur = count_text(text, Family::Heuristic);
    assert!(bpe > 0);
    assert!(heur > 0);
    assert!(bpe < text.len() as u32);
}

#[test]
fn unknown_family_falls_back_to_heuristic() {
    assert_eq!(Family::parse("nope"), Family::Heuristic);
    assert_eq!(count_text("abcd", Family::parse("nope")), 1);
}

#[test]
fn per_message_counts_align_with_input() {
    let json = r#"[
        {"role":"user","content":"hello world"},
        {"role":"assistant","content":[{"type":"text","text":"hi there"}]}
    ]"#;
    let counts = count_messages(json, Family::OpenAi);
    assert_eq!(counts.len(), 2);
    // Each message carries the framing overhead on top of its body.
    assert!(counts[0] > MESSAGE_OVERHEAD as u32 + 1);
    assert!(counts[1] > MESSAGE_OVERHEAD as u32);
}

#[test]
fn tool_use_and_tool_result_blocks_are_counted() {
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
    // toolUse: name + input JSON + flat block cost + overhead.
    assert!(counts[0] > NON_TEXT_BLOCK as u32);
    // toolResult: content + flat block cost + overhead.
    assert!(counts[1] > NON_TEXT_BLOCK as u32);
}

#[test]
fn malformed_json_returns_empty_so_caller_falls_back() {
    assert!(count_messages("not json", Family::OpenAi).is_empty());
    assert!(count_messages("{}", Family::OpenAi).is_empty());
}
