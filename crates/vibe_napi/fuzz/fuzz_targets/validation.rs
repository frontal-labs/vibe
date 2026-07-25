#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(input) = std::str::from_utf8(data) {
        let schema = r#"{"type":"object","properties":{"name":{"type":"string"}}}"#;
        let _ = vibe_napi::validate_tool_input(schema.to_string(), input.to_string());
    }
});
