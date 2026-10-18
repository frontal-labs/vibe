// Integration tests for the vibe_model crate.
// Tests cover token counting for multiple model families, message token
// counting, ModelProviderRegistry, and serde roundtrips for all model types.

use async_trait::async_trait;
use vibe_cancellation::CancellationToken;
use vibe_model::*;
use vibe_shared::{StopReason, TokenUsage};

#[test]
fn test_count_tokens_openai_returns_positive() {
    let count = count_tokens("Hello, world! This is a test message.", "openai");
    assert!(count > 0);
}

#[test]
fn test_count_tokens_anthropic_returns_positive() {
    let count = count_tokens("Hello, world! This is a test message.", "anthropic");
    assert!(count > 0);
}

#[test]
fn test_count_tokens_heuristic_matches_ceil_len_div_4() {
    let text = "hello";
    let expected = (text.len() as f64 / 4.0).ceil() as u32;
    assert_eq!(count_tokens(text, "heuristic"), expected);

    let text2 = "hello world";
    let expected2 = (text2.len() as f64 / 4.0).ceil() as u32;
    assert_eq!(count_tokens(text2, "heuristic"), expected2);
}

#[test]
fn test_count_tokens_empty_returns_zero() {
    assert_eq!(count_tokens("", "openai"), 0);
    assert_eq!(count_tokens("", "anthropic"), 0);
    assert_eq!(count_tokens("", "heuristic"), 0);
}

#[test]
fn test_count_message_tokens_with_valid_json_array() {
    let messages = vec![
        Message {
            role: MessageRole::User,
            content: MessageContent::Text("Hello".to_string()),
        },
        Message {
            role: MessageRole::Assistant,
            content: MessageContent::Text("World".to_string()),
        },
    ];
    let counts = count_message_tokens(&messages, "openai");
    assert_eq!(counts.len(), 2);
    assert!(counts[0] > 0);
    assert!(counts[1] > 0);
}

#[test]
fn test_count_message_tokens_with_invalid_content_returns_defaults() {
    let messages = vec![Message {
        role: MessageRole::Tool,
        content: MessageContent::ToolCall {
            name: "test".to_string(),
            arguments: serde_json::json!({}),
            id: "1".to_string(),
        },
    }];
    let counts = count_message_tokens(&messages, "openai");
    assert_eq!(counts.len(), 1);
    assert_eq!(counts[0], 0);
}

// --- ModelProviderRegistry tests ---

struct MockProvider {
    name: String,
}

impl MockProvider {
    fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
        }
    }
}

#[async_trait]
impl ModelProvider for MockProvider {
    fn name(&self) -> &str {
        &self.name
    }

    async fn generate(
        &self,
        _request: ModelRequest,
        _cancellation_token: Option<CancellationToken>,
    ) -> Result<ModelResponse, ModelError> {
        Ok(ModelResponse {
            id: "mock-id".to_string(),
            model: "mock".to_string(),
            content: vec![],
            stop_reason: StopReason::Stop,
            usage: TokenUsage::default(),
            tool_calls: None,
        })
    }

    async fn stream(
        &self,
        _request: ModelRequest,
        _cancellation_token: Option<CancellationToken>,
    ) -> Result<ModelStream, ModelError> {
        Err(ModelError::Internal(
            "stream not supported in mock".to_string(),
        ))
    }
}

#[test]
fn test_provider_registry_register_and_get() {
    let mut registry = ModelProviderRegistry::new();
    let provider = MockProvider::new("test-provider");
    registry.register(Box::new(provider));

    let retrieved = registry.get("test-provider");
    assert!(retrieved.is_some());
    assert_eq!(retrieved.unwrap().name(), "test-provider");
}

#[test]
fn test_provider_registry_get_non_existent_returns_none() {
    let registry = ModelProviderRegistry::new();
    let retrieved = registry.get("non-existent");
    assert!(retrieved.is_none());
}

#[test]
fn test_provider_registry_providers_lists_registered_names() {
    let mut registry = ModelProviderRegistry::new();
    registry.register(Box::new(MockProvider::new("alpha")));
    registry.register(Box::new(MockProvider::new("beta")));

    let names = registry.providers();
    assert_eq!(names.len(), 2);
    assert!(names.contains(&"alpha"));
    assert!(names.contains(&"beta"));
}

// --- Serde roundtrip tests ---

#[test]
fn test_model_request_serialization_roundtrip() {
    let request = ModelRequest {
        model: "gpt-4".to_string(),
        messages: vec![Message {
            role: MessageRole::User,
            content: MessageContent::Text("Hello".to_string()),
        }],
        system: Some("You are helpful.".to_string()),
        temperature: Some(0.7),
        max_tokens: Some(100),
        stop_sequences: Some(vec!["\n".to_string()]),
        tools: Some(vec![ToolDef {
            name: "search".to_string(),
            description: "Search tool".to_string(),
            input_schema: serde_json::json!({}),
        }]),
    };

    let json = serde_json::to_string(&request).unwrap();
    let deserialized: ModelRequest = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized.model, "gpt-4");
    assert_eq!(deserialized.messages.len(), 1);
    assert_eq!(deserialized.temperature, Some(0.7));
    assert!(deserialized.tools.is_some());
}

#[test]
fn test_model_response_serialization_roundtrip() {
    let response = ModelResponse {
        id: "resp-1".to_string(),
        model: "gpt-4".to_string(),
        content: vec![ContentBlock::Text("Hello!".to_string())],
        stop_reason: StopReason::Stop,
        usage: TokenUsage {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
        },
        tool_calls: Some(vec![ToolCallResult {
            id: "call-1".to_string(),
            name: "search".to_string(),
            arguments: serde_json::json!({"query": "test"}),
        }]),
    };

    let json = serde_json::to_string(&response).unwrap();
    let deserialized: ModelResponse = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized.id, "resp-1");
    assert_eq!(deserialized.usage.total_tokens, 15);
    assert!(deserialized.tool_calls.is_some());
}

#[test]
fn test_message_content_all_variants_serde_roundtrip() {
    let variants: Vec<MessageContent> = vec![
        MessageContent::Text("plain text".to_string()),
        MessageContent::ToolCall {
            name: "search".to_string(),
            arguments: serde_json::json!({"q": "rust"}),
            id: "tc-1".to_string(),
        },
        MessageContent::ToolResult {
            name: "search".to_string(),
            result: serde_json::json!({"results": []}),
            id: "tr-1".to_string(),
        },
        MessageContent::Multi(vec![
            ContentBlock::Text("text block".to_string()),
            ContentBlock::Image {
                data: "base64data".to_string(),
                media_type: "image/png".to_string(),
            },
        ]),
    ];

    for variant in &variants {
        let json = serde_json::to_string(variant).unwrap();
        let deserialized: MessageContent = serde_json::from_str(&json).unwrap();
        match (variant, &deserialized) {
            (MessageContent::Text(a), MessageContent::Text(b)) => assert_eq!(a, b),
            (
                MessageContent::ToolCall { name: n1, .. },
                MessageContent::ToolCall { name: n2, .. },
            ) => {
                assert_eq!(n1, n2);
            }
            (
                MessageContent::ToolResult { name: n1, .. },
                MessageContent::ToolResult { name: n2, .. },
            ) => {
                assert_eq!(n1, n2);
            }
            (MessageContent::Multi(a), MessageContent::Multi(b)) => {
                assert_eq!(a.len(), b.len());
            }
            _ => panic!("Variant mismatch after roundtrip"),
        }
    }
}

#[test]
fn test_model_stream_event_all_variants_serde_roundtrip() {
    let events: Vec<ModelStreamEvent> = vec![
        ModelStreamEvent::Chunk {
            content: "hello".to_string(),
            sequence: 1,
        },
        ModelStreamEvent::ToolCall {
            name: "search".to_string(),
            arguments: r#"{"q":"test"}"#.to_string(),
            id: "tc-1".to_string(),
        },
        ModelStreamEvent::Done {
            response: ModelResponse {
                id: "resp-1".to_string(),
                model: "gpt-4".to_string(),
                content: vec![],
                stop_reason: StopReason::Stop,
                usage: TokenUsage::default(),
                tool_calls: None,
            },
        },
        ModelStreamEvent::Error {
            message: "something failed".to_string(),
            code: "ERR_500".to_string(),
        },
    ];

    for event in &events {
        let json = serde_json::to_string(event).unwrap();
        let deserialized: ModelStreamEvent = serde_json::from_str(&json).unwrap();
        match (event, &deserialized) {
            (
                ModelStreamEvent::Chunk { sequence: s1, .. },
                ModelStreamEvent::Chunk { sequence: s2, .. },
            ) => {
                assert_eq!(s1, s2);
            }
            (
                ModelStreamEvent::ToolCall { id: i1, .. },
                ModelStreamEvent::ToolCall { id: i2, .. },
            ) => {
                assert_eq!(i1, i2);
            }
            (ModelStreamEvent::Done { .. }, ModelStreamEvent::Done { .. }) => {}
            (
                ModelStreamEvent::Error { code: c1, .. },
                ModelStreamEvent::Error { code: c2, .. },
            ) => {
                assert_eq!(c1, c2);
            }
            _ => panic!("Variant mismatch after roundtrip"),
        }
    }
}
