//! Token-counting throughput benchmarks. Run with `cargo bench -p vibe_benchmarks`.
//! Guards the agent-loop hot path: every model round-trip counts the transcript to budget
//! the context window, so this must stay fast relative to the network round-trip it precedes.

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use vibe_tokenizer::{count_messages, count_text, Family};

const PROSE: &str = "\
The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. \
How vexingly quick daft zebras jump! The five boxing wizards jump quickly, repeatedly, \
and with great enthusiasm across the moonlit meadow at the edge of the sleepy village.";

/// A realistic multi-turn transcript: system-set user turns, assistant text, and a tool round-trip.
const TRANSCRIPT: &str = r#"[
  {"role":"user","content":"What's the status of order A-123 and when will it arrive?"},
  {"role":"assistant","content":[{"type":"text","text":"Let me look that up for you."},
    {"type":"toolUse","id":"t1","name":"get_order","input":{"id":"A-123"}}]},
  {"role":"user","content":[{"type":"toolResult","toolUseId":"t1","content":"shipped, ETA 2 days","isError":false}]},
  {"role":"assistant","content":[{"type":"text","text":"Order A-123 has shipped and should arrive in about two days."}]}
]"#;

fn bench_count_text(c: &mut Criterion) {
    c.bench_function("count_text/openai", |b| {
        b.iter(|| count_text(black_box(PROSE), black_box(Family::OpenAi)))
    });
    c.bench_function("count_text/heuristic", |b| {
        b.iter(|| count_text(black_box(PROSE), black_box(Family::Heuristic)))
    });
}

fn bench_count_messages(c: &mut Criterion) {
    c.bench_function("count_messages/openai", |b| {
        b.iter(|| count_messages(black_box(TRANSCRIPT), black_box(Family::OpenAi)))
    });
}

criterion_group!(benches, bench_count_text, bench_count_messages);
criterion_main!(benches);
