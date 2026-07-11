---
title: "Contributing"
description: "Thanks for working on Vibe. This guide gets you from a clean checkout to a merged"
---

# Contributing

Thanks for working on Vibe. This guide gets you from a clean checkout to a merged
PR. Read [Conventions](./01-conventions.md) alongside it — this doc is the
*workflow*, that one is the *code style and layering rules*.

Companion docs: [Testing strategy](../plan/03-testing-strategy.md),
[Release & versioning](../plan/04-release-and-versioning.md),
[Build plan](../plan/01-build-plan.md).

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | **>=20** | CI runs on **22**; test the boundary you touch. |
| bun | **9** (`bun@9.15.4`) | Pinned via `packageManager`; use Corepack. |
| Git | any recent | Conventional commits are enforced (below). |

Enable the pinned bun with Corepack:

```bash
corepack enable
```

## Setup

```bash
git clone <repo> && cd vibe
bun install
```

This installs the workspace and wires the Husky hooks (via the `prepare` script).
One install covers every `@vibe/*` package — it is a bun workspace + Turborepo
monorepo.

## The dev loop

Turborepo orchestrates every task across packages in dependency order, with
caching, so you rarely run tools per-package by hand.

```bash
# Watch-build all packages (tsup --watch), rebuilding dependents on change
bun dev

# Run the full unit test suite (Vitest) across packages
bun test

# Run the type-tests (tsd) across packages
bun test:types

# Typecheck (tsc --noEmit)
bun typecheck

# Lint + format check (Biome)
bun lint
bun format:check
```

To work on one package, scope with Turborepo's filter, e.g.
`bun test --filter @vibe/agent`.

Before every push, run the same gate CI runs:

```bash
bun ci:check   # turbo run lint typecheck build test
bun test:types # tsd type-tests (not part of ci:check)
bun knip       # unused code / deps
```

> Because CI's branch trigger is currently mismatched (`main` vs `master`),
> `bun ci:check` is your *primary* guarantee until that's fixed — do not skip it.
> See [Release & versioning](../plan/04-release-and-versioning.md#the-branch-trigger-bug).

## Fixing lint & format

Biome does both linting and formatting. To auto-fix:

```bash
bun lint:fix   # biome check --write .
bun format     # biome format --write .
```

`lint-staged` runs Biome on staged files at commit time via the Husky `pre-commit`
hook, so most style issues fix themselves before they ever reach a PR.

## Working on the language (Rust)

The `@vibe/*` packages above are the **runtime**. The **language toolchain** —
compiler, LSP, CLI, and formatter — is written in Rust and lives in a separate
Cargo workspace under `crates/*`. The repo has two workspaces side by side: the
bun/Turborepo TypeScript workspace (`packages/*`) and the Cargo workspace
(`crates/*`). See [The compiler is written in Rust](../language/05-rust-implementation.md)
for the crate graph and rationale, and the
[Language implementation plan](../plan/05-language-implementation-plan.md) for the
phased (R0–R11) build.

### Prerequisites

| Tool | Notes |
|---|---|
| rustup | Installs and manages the Rust toolchain. |
| Rust toolchain | **Pinned by `rust-toolchain.toml`** (channel + `rustfmt`, `clippy`) — rustup selects it automatically in the repo. |
| rust-analyzer | Editor language server; add it to your editor for `crates/` work. |

### The Rust dev loop

The crates live under `crates/` (`vibe_lexer`, `vibe_parser`, `vibe_binder`,
`vibe_checker`, `vibe_emit`, `vibe_compiler`, `vibe_cli`, `vibe_lsp`, `vibe_fmt`,
`vibe_napi`, `vibe_wasm`, …), one responsibility per crate.

```bash
cargo build                          # build the whole workspace
cargo test                           # unit + insta snapshot tests
cargo fmt                            # format (rustfmt)
cargo clippy --all-targets -D warnings   # lint; warnings are errors
```

Review snapshot changes with `cargo insta review` when a test's expected output
moves intentionally.

### Two CI tracks

CI runs the two workspaces independently, and both must be green:

- **TypeScript runtime** — `bun ci:check` (lint → typecheck → build → test), plus
  `bun test:types` and `bun knip`, over `packages/*`.
- **Rust toolchain** — `cargo fmt --check`, `cargo clippy --all-targets -D warnings`,
  and `cargo test`, over `crates/*`.

A PR that touches `crates/` must have `cargo fmt`, `cargo clippy` (no warnings), and
`cargo test` green before review — the Rust analog of the `bun ci:check` gate.

## Adding a changeset

Any change a consumer can observe needs a changeset:

```bash
bun changeset
```

Select the affected `@vibe/*` packages, choose the semver bump for each, and write
a clear summary. Commit the generated `.changeset/*.md` file with your code. See
[Release & versioning](../plan/04-release-and-versioning.md#when-a-change-needs-a-changeset)
for what does and doesn't need one.

## Commit message format

Commits follow [Conventional Commits](https://www.conventionalcommits.org/),
enforced by commitlint on the `commit-msg` hook:

```
type(scope): subject
```

- **type:** `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `perf`, `style`,
  `build`, `ci`.
- **scope:** the package name without the `@vibe/` prefix (`agent`, `model`,
  `tools`, `core`, …).
- Breaking changes: `feat(model)!: …` and/or a `BREAKING CHANGE:` footer.

Examples from the history: `feat(lifecycle): add idempotent transitions and
auto-complete stop`, `fix(plugin): correct test expectations for hook ordering`.

## PR expectations

A PR is ready to review when:

- [ ] It includes **`tests/`** (Vitest) for new/changed behavior.
- [ ] It includes **`type-tests/`** (tsd) for new/changed types and inference.
- [ ] **`bun ci:check` is green** locally (lint → typecheck → build → test), plus
      `bun test:types` and `bun knip`.
- [ ] It carries a **changeset** if the change is user-facing.
- [ ] Commits follow the conventional format.
- [ ] It preserves the **acyclic dependency graph** (see below).

Keep PRs scoped to one coherent change. If you're building an agentic package,
follow the phase order and exit gates in the [Build plan](../plan/01-build-plan.md).

## The golden rules

These are enforced by review (and, where possible, by tooling). They're the same
[cross-cutting rules](../plan/01-build-plan.md#cross-cutting-rules-for-every-phase)
the build plan applies to every phase:

1. **No bare `throw new Error`.** Use the `@vibe/errors` factories so errors carry a
   stable `code`, and `retryable` / `fatal` flags the runtime and agent loop branch
   on. A raw `Error` breaks retry classification and serialization.
2. **No `console.log` in library code.** Use `@vibe/logger` with structured context
   (e.g. the run's trace id). Ad-hoc logging is invisible to observability and can't
   be leveled or silenced.
3. **Preserve the acyclic dependency graph.** Packages depend *down*, never up
   (`shared` at the base, `core` as the composition root; agentic packages depend on
   foundations, never the reverse). If you need something from a higher layer,
   you're modeling it in the wrong place. See
   [Package topology](../architecture/02-package-topology.md).
4. **Execution semantics come from `@vibe/runtime`.** Retry, backoff, cancellation,
   timeouts, and resource limits are the runtime's job. The agent loop and tool
   adapter *use* the runtime; they never hand-roll their own retry or cancellation.

Breaking one of these is a request-changes on the PR, not a nit — they're what keep
Vibe's guarantees real.
