//! Only set up napi linkage when the `node` feature is active, so the default
//! workspace build doesn't require Node's N-API symbols.
fn main() {
    if std::env::var("CARGO_FEATURE_NODE").is_ok() {
        napi_build::setup();
    }
}
