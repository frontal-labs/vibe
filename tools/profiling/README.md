# tools/profiling

- **Rust bundler addon**: the `vibe_benchmarks` crate holds criterion benches for
  `vibe_bundler`'s static analysis — `cargo bench -p vibe_benchmarks` (baseline the
  perf gate with criterion's `--save-baseline`). For a flamegraph, `cargo install
  flamegraph` and profile a bench binary with `cargo flamegraph --bench compile -p vibe_benchmarks`.
- **TypeScript runtime**: add `*.bench.ts` files and run `bun x vitest bench`.
  Vitest's benchmarking is enabled by the root Vite/Vitest setup.
