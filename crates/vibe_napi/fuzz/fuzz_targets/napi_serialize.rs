#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok(input) = std::str::from_utf8(data) {
        let _ = vibe_napi::serialize_error(input.to_string(), "FUZZ".to_string());
        let _ = vibe_napi::count_tokens(input.to_string(), "heuristic".to_string());
    }
});
