use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize, Error)]
pub enum VibeError {
    #[error("Runtime error: {message}")]
    RuntimeError { message: String, code: String },

    #[error("{message}")]
    CancellationError { message: String },

    #[error("Validation error: {message}")]
    ValidationError {
        message: String,
        field: Option<String>,
    },

    #[error("Serialization error: {message}")]
    SerializationError { message: String },

    #[error("Configuration error: {message}")]
    ConfigurationError { message: String },

    #[error("Not found: {kind} '{id}'")]
    NotFoundError { kind: String, id: String },

    #[error("Timeout after {duration_ms}ms")]
    TimeoutError { duration_ms: u64 },

    #[error("Internal error: {message}")]
    InternalError { message: String },
}

pub type Result<T> = std::result::Result<T, VibeError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializedError {
    pub message: String,
    pub code: String,
    pub stack: Option<String>,
}

pub fn serialize_error(error: &VibeError) -> SerializedError {
    let code = match error {
        VibeError::RuntimeError { code, .. } => code.clone(),
        VibeError::CancellationError { .. } => "CANCELLATION_ERROR".to_string(),
        VibeError::ValidationError { .. } => "VALIDATION_ERROR".to_string(),
        VibeError::SerializationError { .. } => "SERIALIZATION_ERROR".to_string(),
        VibeError::ConfigurationError { .. } => "CONFIGURATION_ERROR".to_string(),
        VibeError::NotFoundError { .. } => "NOT_FOUND_ERROR".to_string(),
        VibeError::TimeoutError { .. } => "TIMEOUT_ERROR".to_string(),
        VibeError::InternalError { .. } => "INTERNAL_ERROR".to_string(),
    };

    SerializedError {
        message: error.to_string(),
        code,
        stack: None,
    }
}

impl From<serde_json::Error> for VibeError {
    fn from(err: serde_json::Error) -> Self {
        VibeError::SerializationError {
            message: err.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_runtime_error() {
        let err = VibeError::RuntimeError {
            message: "something failed".to_string(),
            code: "ERR_RUNTIME".to_string(),
        };
        assert_eq!(err.to_string(), "Runtime error: something failed");
    }

    #[test]
    fn test_cancellation_error() {
        let err = VibeError::CancellationError {
            message: "task cancelled".to_string(),
        };
        assert_eq!(err.to_string(), "task cancelled");
    }

    #[test]
    fn test_validation_error_with_field() {
        let err = VibeError::ValidationError {
            message: "invalid input".to_string(),
            field: Some("name".to_string()),
        };
        assert_eq!(err.to_string(), "Validation error: invalid input");
    }

    #[test]
    fn test_serialize_error() {
        let err = VibeError::TimeoutError { duration_ms: 5000 };
        let serialized = serialize_error(&err);
        assert_eq!(serialized.code, "TIMEOUT_ERROR");
        assert!(serialized.message.contains("5000"));
    }

    #[test]
    fn test_serialize_cancellation() {
        let err = VibeError::CancellationError {
            message: "cancelled by user".to_string(),
        };
        let serialized = serialize_error(&err);
        assert_eq!(serialized.code, "CANCELLATION_ERROR");
    }

    #[test]
    fn test_error_serialization_roundtrip() {
        let err = VibeError::RuntimeError {
            message: "test".to_string(),
            code: "ERR_TEST".to_string(),
        };
        let json = serde_json::to_string(&err).unwrap();
        let deserialized: VibeError = serde_json::from_str(&json).unwrap();
        assert!(matches!(
            deserialized,
            VibeError::RuntimeError { ref message, .. } if message == "test"
        ));
    }
}
