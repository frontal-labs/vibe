# tools/profiling

- **Rust compiler**: `cargo flamegraph -p vibe_cli -- build <file.vibe>` (needs
  `cargo install flamegraph`). The `benchmarks` crate holds criterion benches:
  `cargo bench -p benchmarks`.
- **TypeScript runtime**: add `*.bench.ts` files and run `bun x vitest bench`.
  Vitest's benchmarking is enabled by the root Vite/Vitest setup.
