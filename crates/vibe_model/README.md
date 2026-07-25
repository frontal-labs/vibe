# vibe-model

Model provider trait, message types, token counting, and streaming abstractions.

## Types

| Type | Description |
|------|-------------|
| `ModelProvider` (trait) | Async trait with `generate()` and `stream()` methods for LLM inference |
| `ModelProviderRegistry` | Thread-safe registry mapping provider names to `Box<dyn ModelProvider>` instances |
| `ModelRequest` | Full request payload: model id, messages, system prompt, temperature, max tokens, stop sequences, tools |
| `ModelResponse` | LLM response: id, model, content blocks, stop reason, token usage, tool calls |
| `Message` | A single message with `role` (System/User/Assistant/Tool) and `content` |
| `MessageContent` | Enum: `Text`, `ToolCall`, `ToolResult`, `Multi` (multiple content blocks) |
| `ContentBlock` | Enum: `Text(String)`, `Image { data, media_type }` |
| `ToolDef` | Tool definition for LLM function-calling |
| `ToolCallResult` | Result of a tool call with id, name, and arguments |
| `ModelStreamEvent` | Streaming event: `Chunk`, `ToolCall`, `Done`, `Error` |
| `ModelStream` | Async stream of `ModelStreamEvent` values |
| `ModelError` | Enum: `ApiError`, `RateLimited`, `AuthError`, `Cancelled`, `StreamError`, `Internal` |
| `Family` | Tokenizer family enum for heuristic token counting |

### Functions

| Function | Description |
|----------|-------------|
| `count_tokens(text, model_family) -> u32` | Heuristic token count for a text string |
| `count_message_tokens(messages, model_family) -> Vec<u32>` | Per-message token counts for an array of messages |
