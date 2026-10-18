// Tests for all VibeError variants: construction, Display output,
// serialize_error, SerializedError roundtrip, From<serde_json::Error>, and Error trait.
use vibe_errors::*;

#[test]
fn test_runtime_error_display() {
    let err = VibeError::RuntimeError {
        message: "something failed".to_string(),
        code: "ERR_RUNTIME".to_string(),
    };
    assert_eq!(err.to_string(), "Runtime error: something failed");
}

#[test]
fn test_runtime_error_serialized() {
    let err = VibeError::RuntimeError {
        message: "runtime problem".to_string(),
        code: "ERR_BOOM".to_string(),
    };
    let serialized = serialize_error(&err);
    assert_eq!(serialized.code, "ERR_BOOM");
    assert!(serialized.message.contains("runtime problem"));
}

#[test]
fn test_runtime_error_serde_roundtrip() {
    let err = VibeError::RuntimeError {
        message: "test".to_string(),
        code: "ERR_TEST".to_string(),
    };
    let json = serde_json::to_string(&err).unwrap();
    let deserialized: VibeError = serde_json::from_str(&json).unwrap();
    assert!(
        matches!(deserialized, VibeError::RuntimeError { ref message, .. } if message == "test")
    );
}

#[test]
fn test_cancellation_error_display() {
    let err = VibeError::CancellationError {
        message: "task cancelled by user".to_string(),
    };
    assert_eq!(err.to_string(), "task cancelled by user");
}

#[test]
fn test_cancellation_error_serialized() {
    let err = VibeError::CancellationError {
        message: "cancelled".to_string(),
    };
    let serialized = serialize_error(&err);
    assert_eq!(serialized.code, "CANCELLATION_ERROR");
}

#[test]
fn test_cancellation_error_serde_roundtrip() {
    let err = VibeError::CancellationError {
        message: "cancelled".to_string(),
    };
    let json = serde_json::to_string(&err).unwrap();
    let deserialized: VibeError = serde_json::from_str(&json).unwrap();
    assert!(matches!(deserialized, VibeError::CancellationError { .. }));
}

#[test]
fn test_validation_error_display_with_field() {
    let err = VibeError::ValidationError {
        message: "invalid input".to_string(),
        field: Some("name".to_string()),
    };
    assert_eq!(err.to_string(), "Validation error: invalid input");
}

#[test]
fn test_validation_error_display_without_field() {
    let err = VibeError::ValidationError {
        message: "missing value".to_string(),
        field: None,
    };
    assert_eq!(err.to_string(), "Validation error: missing value");
}

#[test]
fn test_validation_error_serialized() {
    let err = VibeError::ValidationError {
        message: "bad field".to_string(),
        field: Some("email".to_string()),
    };
    let serialized = serialize_error(&err);
    assert_eq!(serialized.code, "VALIDATION_ERROR");
}

#[test]
fn test_validation_error_serde_roundtrip() {
    let err = VibeError::ValidationError {
        message: "validation failed".to_string(),
        field: Some("age".to_string()),
    };
    let json = serde_json::to_string(&err).unwrap();
    let deserialized: VibeError = serde_json::from_str(&json).unwrap();
    assert!(
        matches!(deserialized, VibeError::ValidationError { ref field, .. } if field.as_deref() == Some("age"))
    );
}

#[test]
fn test_serialization_error_display() {
    let err = VibeError::SerializationError {
        message: "failed to parse json".to_string(),
    };
    assert_eq!(err.to_string(), "Serialization error: failed to parse json");
}

#[test]
fn test_serialization_error_serialized() {
    let err = VibeError::SerializationError {
        message: "parse error".to_string(),
    };
    let serialized = serialize_error(&err);
    assert_eq!(serialized.code, "SERIALIZATION_ERROR");
}

#[test]
fn test_serialization_error_serde_roundtrip() {
    let err = VibeError::SerializationError {
        message: "json error".to_string(),
    };
    let json = serde_json::to_string(&err).unwrap();
    let deserialized: VibeError = serde_json::from_str(&json).unwrap();
    assert!(matches!(deserialized, VibeError::SerializationError { .. }));
}

#[test]
fn test_configuration_error_display() {
    let err = VibeError::ConfigurationError {
        message: "missing config key".to_string(),
    };
    assert_eq!(err.to_string(), "Configuration error: missing config key");
}

#[test]
fn test_configuration_error_serialized() {
    let err = VibeError::ConfigurationError {
        message: "bad config".to_string(),
    };
    let serialized = serialize_error(&err);
    assert_eq!(serialized.code, "CONFIGURATION_ERROR");
}

#[test]
fn test_configuration_error_serde_roundtrip() {
    let err = VibeError::ConfigurationError {
        message: "config error".to_string(),
    };
    let json = serde_json::to_string(&err).unwrap();
    let deserialized: VibeError = serde_json::from_str(&json).unwrap();
    assert!(matches!(deserialized, VibeError::ConfigurationError { .. }));
}

#[test]
fn test_not_found_error_display() {
    let err = VibeError::NotFoundError {
        kind: "execution".to_string(),
        id: "abc-123".to_string(),
    };
    assert_eq!(err.to_string(), "Not found: execution 'abc-123'");
}

#[test]
fn test_not_found_error_serialized() {
    let err = VibeError::NotFoundError {
        kind: "task".to_string(),
        id: "task-42".to_string(),
    };
    let serialized = serialize_error(&err);
    assert_eq!(serialized.code, "NOT_FOUND_ERROR");
    assert!(serialized.message.contains("task-42"));
}

#[test]
fn test_not_found_error_serde_roundtrip() {
    let err = VibeError::NotFoundError {
        kind: "checkpoint".to_string(),
        id: "cp-1".to_string(),
    };
    let json = serde_json::to_string(&err).unwrap();
    let deserialized: VibeError = serde_json::from_str(&json).unwrap();
    assert!(
        matches!(deserialized, VibeError::NotFoundError { ref kind, ref id }
        if kind == "checkpoint" && id == "cp-1")
    );
}

#[test]
fn test_timeout_error_display() {
    let err = VibeError::TimeoutError { duration_ms: 5000 };
    assert_eq!(err.to_string(), "Timeout after 5000ms");
}

#[test]
fn test_timeout_error_zero_duration() {
    let err = VibeError::TimeoutError { duration_ms: 0 };
    assert_eq!(err.to_string(), "Timeout after 0ms");
}

#[test]
fn test_timeout_error_serialized() {
    let err = VibeError::TimeoutError { duration_ms: 30000 };
    let serialized = serialize_error(&err);
    assert_eq!(serialized.code, "TIMEOUT_ERROR");
    assert!(serialized.message.contains("30000"));
}

#[test]
fn test_timeout_error_serde_roundtrip() {
    let err = VibeError::TimeoutError { duration_ms: 10000 };
    let json = serde_json::to_string(&err).unwrap();
    let deserialized: VibeError = serde_json::from_str(&json).unwrap();
    assert!(matches!(
        deserialized,
        VibeError::TimeoutError { duration_ms: 10000 }
    ));
}

#[test]
fn test_internal_error_display() {
    let err = VibeError::InternalError {
        message: "unexpected null pointer".to_string(),
    };
    assert_eq!(err.to_string(), "Internal error: unexpected null pointer");
}

#[test]
fn test_internal_error_serialized() {
    let err = VibeError::InternalError {
        message: "internal failure".to_string(),
    };
    let serialized = serialize_error(&err);
    assert_eq!(serialized.code, "INTERNAL_ERROR");
}

#[test]
fn test_internal_error_serde_roundtrip() {
    let err = VibeError::InternalError {
        message: "internal".to_string(),
    };
    let json = serde_json::to_string(&err).unwrap();
    let deserialized: VibeError = serde_json::from_str(&json).unwrap();
    assert!(matches!(deserialized, VibeError::InternalError { .. }));
}

#[test]
fn test_serialized_error_roundtrip() {
    let original = SerializedError {
        message: "something broke".to_string(),
        code: "ERR_BROKEN".to_string(),
        stack: Some("at line 42".to_string()),
    };
    let json = serde_json::to_string(&original).unwrap();
    let deserialized: SerializedError = serde_json::from_str(&json).unwrap();
    assert_eq!(original.message, deserialized.message);
    assert_eq!(original.code, deserialized.code);
    assert_eq!(original.stack, deserialized.stack);
}

#[test]
fn test_serialized_error_no_stack_roundtrip() {
    let original = SerializedError {
        message: "minimal".to_string(),
        code: "MINIMAL".to_string(),
        stack: None,
    };
    let json = serde_json::to_string(&original).unwrap();
    let deserialized: SerializedError = serde_json::from_str(&json).unwrap();
    assert_eq!(original.code, deserialized.code);
    assert!(deserialized.stack.is_none());
}

#[test]
fn test_serialize_error_all_variants_have_correct_codes() {
    let cases: Vec<(VibeError, &str)> = vec![
        (
            VibeError::RuntimeError {
                message: "".to_string(),
                code: "X".to_string(),
            },
            "X",
        ),
        (
            VibeError::CancellationError {
                message: "".to_string(),
            },
            "CANCELLATION_ERROR",
        ),
        (
            VibeError::ValidationError {
                message: "".to_string(),
                field: None,
            },
            "VALIDATION_ERROR",
        ),
        (
            VibeError::SerializationError {
                message: "".to_string(),
            },
            "SERIALIZATION_ERROR",
        ),
        (
            VibeError::ConfigurationError {
                message: "".to_string(),
            },
            "CONFIGURATION_ERROR",
        ),
        (
            VibeError::NotFoundError {
                kind: "".to_string(),
                id: "".to_string(),
            },
            "NOT_FOUND_ERROR",
        ),
        (VibeError::TimeoutError { duration_ms: 0 }, "TIMEOUT_ERROR"),
        (
            VibeError::InternalError {
                message: "".to_string(),
            },
            "INTERNAL_ERROR",
        ),
    ];
    for (error, expected_code) in cases {
        let serialized = serialize_error(&error);
        assert_eq!(
            serialized.code, expected_code,
            "Mismatch for variant: {error}"
        );
    }
}

#[test]
fn test_from_serde_json_error() {
    let invalid = r#"{invalid json"#;
    let serde_err = serde_json::from_str::<serde_json::Value>(invalid).unwrap_err();
    let vibe_err: VibeError = serde_err.into();
    assert!(matches!(vibe_err, VibeError::SerializationError { .. }));
}

#[test]
fn test_error_trait_source() {
    use std::error::Error;

    let err = VibeError::RuntimeError {
        message: "test".to_string(),
        code: "TST".to_string(),
    };
    assert!(err.source().is_none());

    let err = VibeError::CancellationError {
        message: "test".to_string(),
    };
    assert!(err.source().is_none());

    let err = VibeError::ValidationError {
        message: "test".to_string(),
        field: None,
    };
    assert!(err.source().is_none());

    let err = VibeError::SerializationError {
        message: "test".to_string(),
    };
    assert!(err.source().is_none());

    let err = VibeError::ConfigurationError {
        message: "test".to_string(),
    };
    assert!(err.source().is_none());

    let err = VibeError::NotFoundError {
        kind: "test".to_string(),
        id: "test".to_string(),
    };
    assert!(err.source().is_none());

    let err = VibeError::TimeoutError { duration_ms: 0 };
    assert!(err.source().is_none());

    let err = VibeError::InternalError {
        message: "test".to_string(),
    };
    assert!(err.source().is_none());
}
