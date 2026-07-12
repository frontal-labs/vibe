# vibe-language

A program written in the **Vibe language** (`main.vibe`), compiled to TypeScript by
the `vibe` CLI (which drives the Rust compiler through the napi addon).

```sh
# build the native addon once, then point the CLI at it:
cargo build -p vibe_napi --features node --release
export VIBE_NATIVE_ADDON="$PWD/../../target/release/libvibe_napi.dylib"   # .so on Linux
export VIBE_TEMPLATES_DIR="$PWD/../../tools/templates"

bunx @vibe/cli check main.vibe     # Vibe diagnostics
bunx @vibe/cli build main.vibe     # emit .vibe/main.ts (+ .d.ts + sourcemap)
bunx @vibe/cli fmt main.vibe       # canonical formatting
```

The emitted TypeScript imports `@vibe/tools`, `@vibe/agent`, and `@vibe/config` —
the same runtime the hand-written examples use.
