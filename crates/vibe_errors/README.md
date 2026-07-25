# vibe-errors

Central error types and serialization for the Vibe runtime.

## Types

| Type | Description |
|------|-------------|
| `VibeError` | Enum with 8 variants: `RuntimeError`, `CancellationError`, `ValidationError`, `SerializationError`, `ConfigurationError`, `NotFoundError`, `TimeoutError`, `InternalError` |
| `SerializedError` | FFI-safe error representation with `message`, `code`, and optional `stack` |
| `Result<T>` | Alias for `std::result::Result<T, VibeError>` |

### Functions

| Function | Description |
|----------|-------------|
| `serialize_error(error: &VibeError) -> SerializedError` | Converts a `VibeError` into its FFI-safe form |

### Trait implementations

`VibeError` implements `From<serde_json::Error>` so JSON parsing errors compose naturally.
