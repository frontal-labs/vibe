# Current-State Audit

An honest, severity-ranked inventory of the repository as it stands. This is the
"what's actually true today" companion to the aspirational [vision](../vision/00-manifesto.md).
Nothing here is hidden; a framework that wants to be the best starts by being
truthful about where it is.

## Summary

> **Update (runtime built):** the agentic layer described below as "does not exist
> yet" **now exists and is green.** `@vibe/model`, `@vibe/tools`, `@vibe/memory`,
> and `@vibe/agent` are implemented; `system.ask()` runs the real agent loop
> through a configured provider; one-level multi-agent delegation works. Workspace
> gates pass: `bun lint` / `format:check` / `typecheck` / `build` (13/13) and
> `bun test` (205 tests) / `test:types` (25/25). See the
> [agentic implementation plan](../plan/02-agentic-implementation-plan.md) for
> per-package status. The original audit text is retained below for provenance;
> the 🔴 items about the missing runtime and the broken Biome config are resolved.

The **infrastructure is real, layered, and tested**. The **agentic layer does not
exist yet** — `system.ask()` is a deliberate stub. There is an **in-progress,
uncommitted tooling refactor** that must be finished and committed before the
agentic build starts. A few **process/config bugs** (CI branch mismatch, empty
docs) should be fixed early because they undermine trust.

## Severity legend
- 🔴 **Blocker** — fix before building the agentic layer.
- 🟠 **Important** — fix soon; causes friction or risk.
- 🟡 **Minor** — cleanup / polish.

## Findings

### The headline API is now implemented (was 🔴 unimplemented)
`packages/core/src/system.ts` — `ask(prompt)` now runs the real `@vibe/agent`
loop: `createSystem` registers the model provider, tool registry, and memory in
its container, `ask()` delegates to `system.agent().run({ text })`, and returns
the assistant text. Without a configured `provider` it throws a clear
`configError` (not a stub). The [agentic implementation plan](../plan/02-agentic-implementation-plan.md)
has landed (Packages 1–6). What remains is exercising it against the **live**
Anthropic API (smoke tests behind `ANTHROPIC_API_KEY`).

### 🔴 Uncommitted config refactor is mid-flight
The working tree shows a large, inconsistent change set:
- Every package's `vitest.config.ts` deleted; a single root `vitest.config.ts` +
  `vitest.workspace.ts` added.
- `tsconfig.base.json` removed; a root `tsconfig.json` added.
- Two new **untracked** config packages: `packages/biome-config/`,
  `packages/typescript-config/`.
- `.npmrc`, `biome.json`, `turbo.json`, `bun-lock.yaml`, all package
  `tsconfig.json`s modified.

This is a move toward centralized shared config (good), but it is **half-applied
and uncommitted**. Finish it, verify `bun ci:check` passes, and commit it as one
coherent change *before* adding new packages — otherwise the agentic packages will
be built on shifting sand. See [Build plan](../plan/01-build-plan.md), Phase 0.

### 🟠 CI never runs on this branch — and `main` is assumed in four places
`.github/workflows/ci.yml` triggers on `push`/`pull_request` to `main`, but the
repo's default branch is `master`. **CI is effectively dead.** The same wrong
assumption is baked into three more files:
- `.changeset/config.json` → `"baseBranch": "main"` (breaks changeset diffing).
- `packages/biome-config/biome.json` → `"defaultBranch": "main"` (Biome VCS
  integration).
- `.github/workflows/release.yml` (newly added) → `on: push: branches: [main]`
  (the release/changesets automation never fires on `master`).

Fix all three to match the actual default branch (or rename the branch to `main`
and keep them). Until then, `bun ci:check` (lint, typecheck, build, test) is only
a local guarantee and changeset/versioning automation is unreliable. See
[Release & versioning](../plan/04-release-and-versioning.md).

### 🟠 `docs/` is empty
`docs/architecture/`, `docs/contributing/`, `docs/plan/`, `docs/specs/` exist as
empty directories. The "Phase 4" roadmap referenced in code lives nowhere. This
documentation set fills that gap; keep it in sync as the code lands.

### 🟡 `createToken` uniqueness is process-local
`packages/di/src/token.ts` uses a module-level `let counter = 0` for token
uniqueness. Fine for a single module realm; not collision-safe across realms
(e.g. duplicated module instances, some bundler/test setups). Low risk today;
document the assumption or switch to a `Symbol`-backed identity if it ever bites.
See [Dependency injection](../architecture/03-dependency-injection.md).

### 🟡 Hooks are untyped by argument
`packages/plugin/src/types.ts` — `HookHandler = (...args: unknown[]) => void | Promise<void>`.
The generic lifecycle hooks (`onBefore`/`onAfter`) are keyed by `LifecycleEvent`,
but arbitrary named hooks (`on(name, handler)`) pass `unknown[]`. When the agentic
layer introduces hooks like `agent:beforeModelCall`, give them typed payloads via
a hook-map interface. See [Plugin system](../architecture/06-plugin-system.md).

### 🟡 `System.info` recomputes `Date.now()` on every access
`packages/core/src/system.ts` — `uptimeMs` is fine, but be aware `info` is a getter
that stamps time on read. Harmless; noted so no one caches it expecting stability.

### 🟡 Package `description` fields are empty
Every `packages/*/package.json` has `"description": ""`. Fill these before any
publish; they surface on npm and in `@vibe/*` discovery.

### ✅ The Rust bundler accelerator — a real Cargo workspace
Vibe ships a small Rust side that accelerates `@vibe/build`. The `crates/`/`.cargo/`
directories are a real Cargo workspace:
- Root `Cargo.toml` workspace (`members = ["crates/*", "benchmarks"]`) +
  `rust-toolchain.toml` + `.cargo/config.toml`.
- **Two crates.** `vibe_bundler` — oxc-based static analysis of a Vibe app's
  agent/tool TypeScript modules; it extracts `import` declarations and the
  agent→tool edges so `@vibe/build` can build the dependency graph and code-split
  tools into lazily-loaded chunks (small cold starts). `vibe_napi` — a napi-rs
  binding (behind the `node` feature) exposing `tool_edges(source, marker)` and
  `version()` to JavaScript. `#![forbid(unsafe_code)]`.
- The native binding is an **optional accelerator**; `@vibe/build` works without it.
- Verified green: `cargo build`, `cargo fmt --check`, `cargo clippy -D warnings`,
  `cargo test`. `target/` gitignored; `Cargo.lock` committed.
- A `rust` job added to `ci.yml`; `rust-analyzer` added to the editor recommendations.

### 🟡 Stray / mis-named ghost directories
Several empty top-level directories were added and need triage:
- **`bechmarks/`** — a **typo** for `benchmarks/`. Rename before wiring `criterion`.
- **`errors/`** (top level) — an empty duplicate of `packages/errors`; confusing.
  Remove it, or clarify its purpose.
- **`examples/`, `scripts/`, `tests/`, `patches/`, `.devcontainer/`** — all empty.
  Keep them only if they'll hold real content soon; empty dirs don't survive git
  and read as noise otherwise.

### 🟡 New governance & CI files are real (good) — but unaudited
`LICENSE.md` (Apache-2.0), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`,
`SUPPORT.md`, and workflows `pr-checks.yml` (conventional-commit title gate) and
`release.yml` (Changesets) were added and have real content. Confirm the license
choice is intentional (Apache-2.0) and fix the `release.yml` branch trigger (above).

## What is genuinely good (keep it)

- **Clean acyclic dependency graph.** No cycles; `shared` at the base, `core` as
  the composition root. This is the framework's best asset — protect it.
- **Branded types** (`ServiceToken<T>`, `Brand`) used consistently.
- **Idempotent lifecycle** with auto-complete stop and explicit transition table.
- **Runtime primitives** — retry with jittered backoff, cancellation tokens,
  resource manager, checkpoints, streamable executions — are exactly what the
  agent loop needs.
- **Strict CI gate** (lint → format → typecheck → build → test → type-tests →
  knip) once the branch trigger is fixed.
- **Dedicated `type-tests/` per package** — type-level testing is a first-class
  citizen.

## Immediate action list (ordered)

1. 🔴 Finish and commit the config refactor; confirm `bun ci:check` is green.
2. 🟠 Fix the `main` → `master` trigger in all four places (`ci.yml`, `release.yml`,
   `.changeset/config.json`, `biome-config/biome.json`).
3. 🟠 Land this `docs/` tree (this PR).
4. 🟡 Fill package `description` fields. (`bechmarks/`→`benchmarks/` rename and stray
   `errors/` removal — ✅ done in R0.)
5. ✅ ~~Bootstrap the Cargo workspace (`vibe_bundler` + `vibe_napi`) + CI +
   `rust-analyzer`~~ — **done**.
6. 🔴 Build the runtime per the [agentic implementation plan](../plan/02-agentic-implementation-plan.md)
   (model → tools → agent → `ask()`).
