use criterion::{black_box, criterion_group, criterion_main, Criterion};
use vibe_cancellation::CancellationTokenSource;

fn bench_token_create(c: &mut Criterion) {
    c.bench_function("cancellation_token_create", |b| {
        b.iter(|| {
            let source = CancellationTokenSource::new();
            let _token = black_box(source.token());
        });
    });
}

fn bench_token_cancel(c: &mut Criterion) {
    c.bench_function("cancellation_token_cancel", |b| {
        b.iter(|| {
            let source = CancellationTokenSource::new();
            let token = source.token();
            black_box(token.is_cancelled());
            source.cancel();
            black_box(token.is_cancelled());
        });
    });
}

criterion_group!(benches, bench_token_create, bench_token_cancel);
criterion_main!(benches);
