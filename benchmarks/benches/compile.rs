//! Bundler-analysis throughput benchmarks. Run with `cargo bench -p vibe_benchmarks`.
//! In CI these feed a regression gate (compare against a committed baseline with
//! `critcmp` / `criterion`'s `--save-baseline`).

use criterion::{black_box, criterion_group, criterion_main, Criterion};

const AGENT: &str = "\
import { createAgent } from \"vibe/agent\"
import getOrder from \"../tools/get-order\"
import lookup from \"../tools/lookup\"
import { z } from \"zod\"

export default createAgent({
  system: \"You are a concise support agent.\",
  tools: [getOrder, lookup],
})
";

fn bench_tool_edges(c: &mut Criterion) {
    c.bench_function("tool_edges", |b| {
        b.iter(|| vibe_bundler::tool_edges(black_box(AGENT), black_box("/tools/")))
    });
}

criterion_group!(benches, bench_tool_edges);
criterion_main!(benches);
