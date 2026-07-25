use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::mpsc;

use vibe_cancellation::CancellationToken;
use vibe_shared::{StopReason, TokenUsage};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelRequest {
    pub model: String,
    pub messages: Vec<Message>,
    pub system: Option<String>,
    pub temperature: Option<f64>,
    pub max_tokens: Option<u32>,
    pub stop_sequences: Option<Vec<String>>,
    pub tools: Option<Vec<ToolDef>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: MessageRole,
    pub content: MessageContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MessageRole {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MessageContent {
    Text(String),
    ToolCall {
        name: String,
        arguments: serde_json::Value,
        id: String,
    },
    ToolResult {
        name: String,
        result: serde_json::Value,
        id: String,
    },
    Multi(Vec<ContentBlock>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ContentBlock {
    Text(String),
    Image { data: String, media_type: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDef {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelResponse {
    pub id: String,
    pub model: String,
    pub content: Vec<ContentBlock>,
    pub stop_reason: StopReason,
    pub usage: TokenUsage,
    pub tool_calls: Option<Vec<ToolCallResult>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallResult {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ModelStreamEvent {
    Chunk { content: String, sequence: u32 },
    ToolCall { name: String, arguments: String, id: String },
    Done { response: ModelResponse },
    Error { message: String, code: String },
}

#[derive(Debug, Error)]
pub enum ModelError {
    #[error("API error: {message}")]
    ApiError { message: String, status_code: u16 },
    #[error("Rate limited: retry after {retry_after_ms}ms")]
    RateLimited { retry_after_ms: u64 },
    #[error("Authentication error: {message}")]
    AuthError { message: String },
    #[error("Request cancelled")]
    Cancelled,
    #[error("Stream error: {message}")]
    StreamError { message: String },
    #[error("{0}")]
    Internal(String),
}

impl From<reqwest::Error> for ModelError {
    fn from(err: reqwest::Error) -> Self {
        ModelError::ApiError {
            message: err.to_string(),
            status_code: err.status().map(|s| s.as_u16()).unwrap_or(0),
        }
    }
}

#[async_trait]
pub trait ModelProvider: Send + Sync {
    fn name(&self) -> &str;
    async fn generate(&self, request: ModelRequest, cancellation_token: Option<CancellationToken>) -> Result<ModelResponse, ModelError>;
    async fn stream(
        &self,
        request: ModelRequest,
        cancellation_token: Option<CancellationToken>,
    ) -> Result<ModelStream, ModelError>;
}

pub struct ModelStream {
    receiver: mpsc::Receiver<Result<ModelStreamEvent, ModelError>>,
}

impl ModelStream {
    pub fn new(receiver: mpsc::Receiver<Result<ModelStreamEvent, ModelError>>) -> Self {
        Self { receiver }
    }

    pub async fn next(&mut self) -> Option<Result<ModelStreamEvent, ModelError>> {
        self.receiver.recv().await
    }
}

pub fn count_tokens(text: &str, model_family: &str) -> u32 {
    match model_family {
        "openai" | "cl100k" => count_cl100k_tokens(text),
        "anthropic" => count_anthropic_tokens(text),
        "heuristic" => count_heuristic_tokens(text),
        _ => count_heuristic_tokens(text),
    }
}

fn count_cl100k_tokens(text: &str) -> u32 {
    let tokens = text.split_whitespace().count() as u32;
    let chars = text.chars().count() as u32;
    tokens + (chars / 4)
}

fn count_anthropic_tokens(text: &str) -> u32 {
    let word_tokens = text.split_whitespace().count() as u32;
    let char_tokens = text.chars().count() as u32 / 3;
    word_tokens + char_tokens
}

fn count_heuristic_tokens(text: &str) -> u32 {
    (text.len() as f64 / 4.0).ceil() as u32
}

pub fn count_message_tokens(messages: &[Message], model_family: &str) -> Vec<u32> {
    messages
        .iter()
        .map(|msg| match &msg.content {
            MessageContent::Text(t) => count_tokens(t, model_family),
            MessageContent::Multi(blocks) => blocks
                .iter()
                .map(|b| match b {
                    ContentBlock::Text(t) => count_tokens(t, model_family),
                    ContentBlock::Image { .. } => 100,
                })
                .sum(),
            _ => 0,
        })
        .collect()
}

pub struct ModelProviderRegistry {
    providers: Vec<Box<dyn ModelProvider>>,
}

impl ModelProviderRegistry {
    pub fn new() -> Self {
        Self {
            providers: Vec::new(),
        }
    }

    pub fn register(&mut self, provider: Box<dyn ModelProvider>) {
        self.providers.push(provider);
    }

    pub fn get(&self, name: &str) -> Option<&dyn ModelProvider> {
        self.providers.iter().find(|p| p.name() == name).map(|p| p.as_ref())
    }

    pub fn providers(&self) -> Vec<&str> {
        self.providers.iter().map(|p| p.name()).collect()
    }
}

impl Default for ModelProviderRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_count_tokens_openai() {
        let count = count_tokens("Hello, world! This is a test.", "openai");
        assert!(count > 0);
    }

    #[test]
    fn test_count_tokens_anthropic() {
        let count = count_tokens("Hello, world! This is a test.", "anthropic");
        assert!(count > 0);
    }

    #[test]
    fn test_count_tokens_heuristic() {
        let count = count_tokens("hello", "heuristic");
        assert!(count > 0);
    }

    #[test]
    fn test_count_tokens_empty() {
        assert_eq!(count_tokens("", "openai"), 0);
        assert_eq!(count_tokens("", "anthropic"), 0);
        assert_eq!(count_tokens("", "heuristic"), 0);
    }

    #[test]
    fn test_count_tokens_unknown_family() {
        let count = count_tokens("test", "unknown");
        assert!(count > 0);
    }

    #[test]
    fn test_count_message_tokens() {
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
    fn test_provider_registry() {
        let registry = ModelProviderRegistry::new();
        assert!(registry.providers().is_empty());
    }

    #[test]
    fn test_model_request_serialization() {
        let request = ModelRequest {
            model: "gpt-4".to_string(),
            messages: vec![Message {
                role: MessageRole::User,
                content: MessageContent::Text("Hello".to_string()),
            }],
            system: None,
            temperature: Some(0.7),
            max_tokens: Some(100),
            stop_sequences: None,
            tools: None,
        };
        let json = serde_json::to_string(&request).unwrap();
        let deserialized: ModelRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.model, "gpt-4");
    }

    #[test]
    fn test_model_response_serialization() {
        let response = ModelResponse {
            id: "test-id".to_string(),
            model: "gpt-4".to_string(),
            content: vec![ContentBlock::Text("Hello".to_string())],
            stop_reason: StopReason::Stop,
            usage: TokenUsage {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
            },
            tool_calls: None,
        };
        let json = serde_json::to_string(&response).unwrap();
        let deserialized: ModelResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "test-id");
    }
}
