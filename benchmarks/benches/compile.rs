//! Compiler throughput benchmarks. Run with `cargo bench -p vibe_benchmarks`.
//! In CI these feed a regression gate (compare against a committed baseline with
//! `critcmp` / `criterion`'s `--save-baseline`).

use criterion::{black_box, criterion_group, criterion_main, Criterion};

const SAMPLE: &str = "\
config { name \"bench\" ; provider anthropic }

/// Look up an order's status.
tool GetOrder(orderId: string) -> string { return `shipped: ${orderId}` }

model Fast { id claude-haiku-4-5 ; effort low }

agent Triage {
  model Fast
  system \"Classify the request and route it.\"
  use GetOrder
}

agent Support {
  model claude-opus-4-8
  system \"You are a concise support agent.\"
  use GetOrder
  use Triage
}
";

fn benches(c: &mut Criterion) {
    c.bench_function("compile", |b| {
        b.iter(|| vibe_compiler::compile(black_box(SAMPLE)))
    });
    c.bench_function("compile_json", |b| {
        b.iter(|| vibe_compiler::compile_json(black_box(SAMPLE)))
    });
}

criterion_group!(group, benches);
criterion_main!(group);
