use criterion::{black_box, criterion_group, criterion_main, Criterion};
use vibe_retry::{calculate_backoff, default_retry_policy};

fn bench_calculate_backoff(c: &mut Criterion) {
    let policy = default_retry_policy();

    c.bench_function("retry_calculate_backoff", |b| {
        b.iter(|| {
            let delay = calculate_backoff(black_box(3), black_box(&policy));
            black_box(delay);
        });
    });
}

criterion_group!(benches, bench_calculate_backoff);
criterion_main!(benches);
