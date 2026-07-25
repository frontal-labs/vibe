# vibe-tools

Tool abstraction with JSON Schema input validation, timeout-guarded execution, and cancellation support.

## Types

| Type | Description |
|------|-------------|
| `Tool` | A named, executable tool with an input schema and an `Arc<dyn Fn>` executor |
| `ToolInput` | Input to a tool call: `name` + `arguments` (JSON value) |
| `ToolOutput` | Result of a tool call: `name`, `result` (JSON value), `duration_ms` |
| `ToolDefinition` | Static tool metadata: `name`, `description`, `input_schema` |
| `ToolError` | Error with `message` and `code` — implements `Display` + `Error` |
| `ToolResult` | Alias for `Result<ToolOutput, ToolError>` |
| `ToolSchema` | Alias for `serde_json::Value` |

### Tool

| Method | Description |
|--------|-------------|
| `new(name, description, input_schema, executor)` | Creates a tool with a typed executor function |
| `execute(input, cancellation_token) -> ToolResult` | Runs the tool synchronously with an optional cancellation token |
| `definition() -> ToolDefinition` | Returns the tool's static metadata |

### Functions

| Function | Description |
|----------|-------------|
| `validate_tool_input(schema, input)` | Validates JSON input against a JSON Schema (checks required fields and type constraints) |
| `run_tool_call(tool, input, cancellation_token, timeout_ms)` | Validates input, then runs the tool with optional timeout and cancellation |
| `with_timeout(operation, duration)` | Wraps an async operation with a timeout limit |
