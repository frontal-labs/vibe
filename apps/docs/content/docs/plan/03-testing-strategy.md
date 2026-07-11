---
title: "Testing Strategy"
description: "How Vibe stays correct as the agentic layer lands. The rule is simple and"
---

# Testing Strategy

How Vibe stays correct as the agentic layer lands. The rule is simple and
non-negotiable: **every package ships `tests/` and `type-tests/`, and
`bun ci:check` stays green.** This document describes the layers of testing, the
tools behind each, and the specific behaviors the agent loop must prove.

This is the **runtime** (TypeScript) test story. The **language toolchain is Rust**
(the `crates/` workspace — see the
[Language implementation plan](./05-language-implementation-plan.md)), and it has its own
tooling; the [Rust testing](#rust-testing-the-crates-workspace) section below covers it,
and [What CI runs](#what-ci-runs) explains the two CI tracks.

Companion docs: [Build plan](./01-build-plan.md) (per-phase exit gates),
[Release & versioning](./04-release-and-versioning.md),
[Contributing](../contributing/00-contributing.md).

## The two test surfaces per package

Every `@vibe/*` package has two independent test directories, each with its own
runner:

| Surface | Directory | Runner | Script | What it proves |
|---|---|---|---|---|
| Runtime behavior | `tests/` | Vitest | `vitest run` (`bun test`) | The code *does* the right thing |
| Type behavior | `type-tests/` | tsd | `tsd` (`bun test:types`) | The code *typed* the right thing |

This split is deliberate: a green `vitest` run says nothing about whether inference
holds, and a green `tsc` says nothing about runtime behavior. Vibe treats both as
first-class.

## Unit tests (Vitest)

Vitest 3 runs the `tests/` directory of each package. Tests are colocated by
package and import from `../src`, exercising the public surface directly. The
existing packages set the pattern — e.g. `packages/lifecycle/tests/lifecycle.test.ts`
drives the state machine through every transition:

```ts
import { describe, expect, it } from "vitest"
import { createLifecycle } from "../src/lifecycle"

it("should transition from created to ready on start", async () => {
  const lc = createLifecycle()
  await lc.start()
  expect(lc.state).toBe("ready")
})
```

Guidelines:

- **Test the factory's public contract**, not private helpers. Vibe is
  factory-function based (`createLifecycle`, `createToolRegistry`, `createAgent`), so
  tests construct through the factory and assert on the returned object.
- **Deterministic by construction.** No wall-clock sleeps, no network, no ambient
  state. Time-dependent logic takes an injectable clock; randomness (jittered
  backoff) is seeded or asserted by range.
- **Errors are asserted by type and code**, not by message string — use the
  `@vibe/errors` factories and check `error.code` / `retryable` / `fatal`.

## Type-tests (tsd / `expectAssignable`)

The `type-tests/` directory holds `*.test-d.ts` files run by `tsd` (configured per
package via `"tsd": { "directory": "type-tests" }`). These are compile-time
assertions — they never execute. The vocabulary:

```ts
import { expectType, expectAssignable, expectError } from "tsd"

// exact type identity
expectType<ServiceToken<string>>(createToken<string>("str"))

// looser: value inhabits the type (preferred for unions / branded outputs)
expectAssignable<string | undefined>(maybeValue())

// negative assertions: this should NOT compile
expectError<SystemId>("plain-string")
```

The migration to `expectAssignable` for union- and brand-shaped assertions (see the
recent `test(shared)` commit) is the house style: use `expectType` when identity
matters, `expectAssignable` when membership is the real contract, and `expectError`
to lock in the negative cases that make branded types and inference valuable.

**What type-tests must cover in the agentic layer:**

- `defineTool` — the `execute` handler's args are inferred from the Zod schema
  (`z.infer`), and a wrong-shaped handler is an `expectError`.
- `ModelRequest`/`ModelResponse` normalization — the mapped shapes are assignable to
  the public types.
- Branded ids (trace ids, tokens) — distinct brands are not cross-assignable.

## The deterministic fake ModelProvider

The agent loop cannot be tested against a live model — that would be slow,
non-deterministic, and cost money on every CI run. Instead, `@vibe/model` ships a
**fake provider** (`fake/provider.ts`) driven by a script:

```ts
const provider = createFakeProvider([
  { stopReason: "tool_use", content: [toolUse("lookupOrder", { id: "1024" })] },
  { stopReason: "end_turn", content: [text("Order #1024 shipped yesterday.")] },
])
```

The fake returns scripted `ModelResponse`s in order, including tool-use blocks,
refusals, and `max_tokens` truncation. This is what makes agent-loop tests
deterministic: a scripted `tool_use → tool_result → end_turn` exchange produces an
exact, asserted transcript. The fake is a test fixture, not a mock library — it
implements the real `ModelProvider` interface, so the loop can't tell it from
Anthropic.

## Tool-execution tests

`@vibe/tools` tests the full define → register → execute path:

- **Round-trip.** `defineTool` → `registry.register` → `runToolCall` returns the
  handler's typed result.
- **Errors become results, not throws.** A handler that throws yields
  `{ isError: true, content }` (mapped to the model's `tool_result(is_error)`) —
  asserted, because the loop depends on tools never throwing past the adapter.
- **Cancellation.** A long-running tool aborts when its `ToolContext.cancellationToken`
  is cancelled — proving handlers cooperate with the runtime.
- **Duplicate names rejected.** The registry raises on a name collision.

Because `runToolCall` schedules the handler as a [runtime execution](../architecture/05-runtime-execution.md),
these tests also exercise timeout and `ResourceManager` limits through the real
runtime rather than a stand-in.

## Live smoke tests (guarded by `ANTHROPIC_API_KEY`)

A small number of tests hit the real Anthropic API to prove the provider mapping is
correct against the live contract. These are **guarded** so they never run in CI
without a key:

```ts
const it_live = process.env.ANTHROPIC_API_KEY ? it : it.skip

it_live("returns text from a live model", async () => {
  const provider = createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const res = await provider.generate({ model: "claude-opus-4-8", /* … */ })
  expect(res.content.some(isText)).toBe(true)
})
```

CI does not set `ANTHROPIC_API_KEY`, so these `it.skip` out and the CI run stays
free and deterministic. Contributors run them locally with a key when touching the
provider mapping. Keep them minimal — a live smoke test proves the wire format, not
behavior; behavioral coverage belongs to the fake provider.

## Testing the agent loop's control behavior

The loop's value is in its *control flow* under adversity, so these behaviors get
dedicated tests, all driven by the fake provider (see
[the loop pseudocode](./02-agentic-implementation-plan.md#the-loop-pseudocode)):

- **Cancellation mid-run.** A `cancellationToken` cancelled between steps causes the
  loop to stop, release resources, and return/raise — asserted at both a pre-model
  and pre-tool checkpoint.
- **Retry / backoff.** A fake provider scripted to emit a `RateLimitError` then
  succeed proves the loop retries *through the runtime* (`retryOn([RateLimit,
  Overloaded])`) rather than hand-rolling retry. Backoff is asserted by attempt
  count, not by timing.
- **Iteration ceiling.** A script that never emits `end_turn` must raise
  `AgentIterationLimitError` after `maxIterations` (default 10) — never loop forever.
- **Parallel tool calls.** A response with multiple `tool_use` blocks resolves all
  handlers with `Promise.all` and appends a *single* tool-results message.
- **Stop-reason branches.** `refusal` and `max_tokens` route to their handlers, not
  to another model call.

## Rust testing (the `crates/` workspace)

The language front end is Rust, so it is tested with the Rust toolchain, not Vitest.
The philosophy mirrors the runtime side — deterministic, exhaustive on the parts that
can hurt you — but the tools differ. See the
[Language implementation plan](./05-language-implementation-plan.md) for which phase
(`R0`–`R11`) each layer lands in, and
[The compiler is written in Rust](../language/05-rust-implementation.md) for the crate
graph.

| Surface | Tool | What it proves |
|---|---|---|
| Unit + integration | `cargo test` | Each crate's public API does the right thing |
| Snapshots | [`insta`](https://insta.rs) | Tokens, AST, diagnostics, and emitted TS are stable and reviewable |
| Emit correctness | golden-file + `tsc --noEmit` | Emitted `.ts` actually type-checks against the runtime |
| CLI | [`assert_cmd`](https://docs.rs/assert_cmd) | `vibe build`/`check`/`new` behave end-to-end |
| Benchmarks | [`criterion`](https://bheisler.github.io/criterion.rs/) (in `benchmarks/`) | Perf doesn't silently regress |
| Robustness | fuzzing (`cargo-fuzz`) | The lexer/parser never panic on adversarial input |

**`insta` snapshot tests — the workhorse.** Every stage of the front end snapshots its
output so a change to token layout, AST shape, a diagnostic message, or emitted TypeScript
shows up as a reviewable diff (`cargo insta review`). This is the Rust equivalent of an
asserted transcript: `vibe_lexer` snapshots the token stream per construct, `vibe_parser`
snapshots the AST, `vibe_checker` snapshots `VBxxxx` diagnostics (code + span + message),
and `vibe_emit` snapshots the emitted `.ts`. A ui-test-style corpus of valid **and**
intentionally-broken `.vibe` files pins error recovery and precise spans.

**Golden-file emit tests that compile their output.** `vibe_emit` golden tests pair each
`.vibe` input with its expected `.ts`, and then a **compile-the-output** test runs
`tsc --noEmit` over the emitted TypeScript against stub runtime types — proving the
emitter targets code that actually type-checks against `@vibe/*`, not just code that
*looks* right. Source-map round-trips are asserted the same way (emitted position →
`.vibe` position).

**`assert_cmd` CLI integration tests.** The `vibe` binary is exercised as a black box:
`vibe check` exits non-zero on a bad model id and prints the `VBxxxx` diagnostic;
`vibe build` turns a fixture project into `.ts`/`.js`; `vibe new` scaffolds a project that
`vibe check` then passes. These are the Rust analogue of the `core` integration tests.

**`criterion` benchmarks.** Perf-sensitive stages (lexer throughput, parse of a large
file, full-project compile) have `criterion` benches under `benchmarks/` (note: the ghost
`bechmarks/` dir is renamed to `benchmarks/` in [Phase
R0](./05-language-implementation-plan.md#phase-r0--workspace-bootstrap--done)). A
benchmark gate in [Phase R11](./05-language-implementation-plan.md#phase-r11--release-engineering)
fails CI on a regression.

**Fuzzing the lexer/parser.** Because the lexer captures embedded TypeScript as opaque
byte spans and the parser must recover from arbitrary broken input (for the LSP), both are
fuzzed (`cargo-fuzz`) to guarantee they never panic — a hard requirement, since
`#![forbid(unsafe_code)]` means a panic is the worst failure mode, and the LSP must survive
half-typed files.

**The cross-compile release matrix** (Phase R11) is itself a test surface: CI builds the
binaries and `.node`/`.wasm` artifacts on macOS arm64/x64, Linux x64/arm64 (gnu + musl),
and Windows x64, and a smoke test (`npx vibe --version`, `cargo install`) proves each
artifact runs before release.

## What CI runs

CI now has **two tracks** that both gate `master` — the runtime (TypeScript) track and
the language (Rust) track — because the two workstreams have independent toolchains.

**Track 1 — runtime (TypeScript).** `.github/workflows/ci.yml` and the local
`bun ci:check` are the same gate, run through Turborepo so unchanged packages are
cached:

- **`ci:check`** = `turbo run lint typecheck build test` — Biome lint, `tsc
  --noEmit`, `tsup` build, and Vitest unit tests, in dependency order.
- **`bun test:types`** — the tsd type-tests (a separate CI step, since tsd is not
  part of `ci:check`).
- **`bun format:check`** — Biome formatting is verified, not fixed, in CI.
- **`bun knip`** — dead-code / unused-dependency detection.

**Track 2 — language (Rust).** A parallel CI job runs the `crates/` workspace toolchain,
established in [Phase R0](./05-language-implementation-plan.md#phase-r0--workspace-bootstrap--done):

- **`cargo fmt --check`** — formatting is verified, not fixed (the `rustfmt` analogue of
  `bun format:check`).
- **`cargo clippy --all-targets -D warnings`** — lints are errors; a warning fails the
  build.
- **`cargo test`** — unit, `insta` snapshot, golden-file, and `assert_cmd` CLI tests
  across every crate.
- **Release-only:** the cross-compile matrix and `criterion` benchmark gate (Phase R11).

Both tracks must be green for a merge. They are independent — a runtime-only change need
not rebuild the Rust workspace and vice versa — but the emit contract couples them: a
change to the runtime's public API can break `vibe_emit`'s golden-file `tsc --noEmit`
tests, which is exactly the signal you want.

> **Note:** CI currently triggers on `main` while the default branch is `master`,
> so the gate does not actually run on pushes. Fixing this is an M0 blocker — see
> [Release & versioning](./04-release-and-versioning.md#the-branch-trigger-bug).
> Until it is fixed, `bun ci:check` is only a *local* guarantee.

CI uses Node 22; the engines floor is Node >=20. Test both boundaries locally if a
change touches Node-version-sensitive APIs.

## Coverage expectations per layer

Vibe does not chase a single global coverage number; expectations scale with how
much a layer can hurt you:

| Layer | Packages | Expectation |
|---|---|---|
| Foundations | `shared`, `errors`, `di`, `lifecycle` | Near-exhaustive. State machines and branded types are cheap to test fully; test every transition and every guard. |
| Orchestration | `runtime`, `plugin` | High. Retry, cancellation, resource limits, and hook ordering are the loop's safety net — cover the failure paths, not just the happy path. |
| Model / tools / memory | `model`, `tools`, `memory` | High on mapping and inference (unit + type-tests); the Anthropic wire format is covered by a *thin* guarded live smoke test, everything else by the fake provider. |
| Agent | `agent` | The control behaviors above are mandatory; a merged loop change without a cancellation/retry/ceiling test is incomplete. |
| Composition | `core` | Integration-level: `start()` → `ask()` returns, a tool-using run works, the quickstart runs verbatim. |

The measure of "enough" is: **could this fail in a way no test would catch?** For
the agent loop, the answer must be no for cancellation, retry, and the iteration
ceiling — those are the invariants users trust.
