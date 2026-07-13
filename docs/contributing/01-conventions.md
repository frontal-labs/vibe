# Conventions

The code-level conventions that make Vibe consistent across packages. Where
[Contributing](./00-contributing.md) covers the workflow, this covers *how the code
is shaped*. These are the patterns the existing packages already follow — match
them.

## Package structure

Every `@vibe/*` package has the same skeleton:

```
packages/<name>/
  src/
    index.ts          public exports — the ONLY entry point
    types.ts          shared types for the package
    <feature>.ts      implementation, kebab-case filenames
  tests/              Vitest unit tests (*.test.ts)
  type-tests/         tsd type-tests (*.test-d.ts)
  package.json
  tsconfig.json
  tsup.config.ts
```

`src/index.ts` is the barrel: it is the package's entire public API. If it isn't
exported from `index.ts`, it's private — tests reach into `../src/...` directly, but
consumers only ever see the barrel.

### Build & package.json

Packages build with **tsup** to dual ESM + CJS with declarations:

```ts
// tsup.config.ts
import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
})
```

The `package.json` follows the shared shape — note `"main": "./dist/index.cjs"`
(CJS entry), `"module": "./dist/index.js"` (ESM), `"types": "./dist/index.d.ts"`,
`"type": "module"`, an `exports` map, `"files": ["dist"]`, and the standard scripts
(`build`/`dev`/`test`/`test:types`/`typecheck`/`clean`) plus the
`"tsd": { "directory": "type-tests" }` block. Copy an existing package
(`packages/lifecycle`) as the template rather than writing one from scratch.

## Factory-function style

Vibe is **factory-function based, not class-based.** Public constructors are
`create*` functions returning an object that satisfies an interface:

```ts
export function createLifecycle(options?: LifecycleOptions): Lifecycle { /* … */ }
export function createToolRegistry(): ToolRegistry { /* … */ }
export function createAgent(config: AgentConfig): Agent { /* … */ }
```

This keeps the surface small (no `new`, no inheritance), makes dependencies
explicit via arguments, and makes objects easy to fake in tests. Return interfaces,
not concrete types — consumers depend on the interface.

## Options objects

Functions take a **single options object** rather than positional parameters once
there's more than one meaningful argument. It keeps call sites readable and lets
options grow additively (a new optional field is a minor bump, not a breaking
signature change):

```ts
// good
createAgent({ model, system, tools, memory })
defineTool({ name, description, schema, execute })

// avoid
createAgent(model, system, tools, memory)
```

## Branded types

Identifiers and tokens use branded types so distinct id kinds are not accidentally
interchangeable, even though they're `string`/`number` at runtime:

```ts
type SystemId = Brand<string, "SystemId">
type TraceId  = Brand<string, "TraceId">
// SystemId is not assignable to TraceId — enforced at compile time
```

The DI `ServiceToken<T>` and the `Brand` helper (in `@vibe/shared`) are the
canonical examples. New ids in the agentic layer (trace ids, run ids) follow the
same pattern, with an `expectError` type-test proving distinct brands don't
cross-assign.

## Errors: factories, not `new Error`

Never `throw new Error(...)` in library code. Use the `@vibe/errors` factories, which
produce errors carrying a stable `code` and `retryable`/`fatal` flags:

```ts
throw rateLimitError({ retryAfterMs })          // retryable: true
throw agentIterationLimitError(iteration)       // fatal to the run
```

When you add a new failure mode, add its code to `error-codes.ts` and a factory
alongside it — don't invent ad-hoc error shapes. The runtime's retry logic and the
agent loop's stop-reason handling branch on these flags; a bare `Error` is invisible
to them. Type-tests assert the serialized shape (see
`packages/errors/type-tests/errors.test-d.ts`).

## Logging with context

Use `@vibe/logger`, never `console.*`. Log structured context, not interpolated
strings — carry the run's trace id so events correlate:

```ts
log.info("model:end", { trace, iteration, usage: response.usage })
```

Choose the level deliberately (`debug` for step detail, `info` for lifecycle
milestones, `warn`/`error` for problems). Structured context is what makes the
agent loop observable; a `console.log` is not.

## Import ordering (Biome)

Biome's `organizeImports` is enabled and enforced in CI (`bun format:check`), so
import order is not a matter of taste — let the tool sort it. The resulting shape,
seen throughout the codebase, is: external packages first, then a blank line, then
local/relative imports, with `import type` used for type-only imports:

```ts
import { describe, expect, it } from "vitest"

import { createLifecycle } from "../src/lifecycle"
import type { LifecycleState } from "../src/state"
```

Run `bun lint:fix` / `bun format` to apply it; `lint-staged` also fixes staged
files on commit.

## File naming

Files are **kebab-case**: `error-codes.ts`, `map-request.ts`, `request-builder.ts`,
`memory-inmemory.ts`. Test files mirror the surface they cover:
`lifecycle.test.ts` (Vitest) and `errors.test-d.ts` (tsd). One cohesive concept per
file; the barrel re-exports.

## The layering rule

The dependency graph is **acyclic and directional** — packages depend *down*, never
up:

```
shared ─▶ errors ─▶ di ─▶ lifecycle ─▶ logger ─▶ plugin ─▶ runtime ─▶ core
                                                                        ▲
agentic:  model ─▶ tools ─▶ memory ─▶ agent ──────────────────────────┘
```

Concretely:

- Foundation packages (`shared`, `errors`, …) know nothing about the agentic layer.
- Agentic packages depend on foundations and on each other in one direction
  (`model` → `tools`/`memory` → `agent`), and are composed at `core`.
- **Execution semantics live in `@vibe/runtime`.** Anything needing retry, backoff,
  cancellation, timeout, or resource limits imports the runtime — it does not
  reimplement them. The agent loop and the tool-execution adapter are consumers of
  the runtime, not competitors to it.

This isn't only architecture — it's the [versioning
contract](../plan/04-release-and-versioning.md#semver-policy-for-the-vibe-monorepo)
too: a cycle or an upward dependency would make independent package versioning
impossible. If a change seems to need an upward import, the abstraction is in the
wrong package. See [Package topology](../architecture/02-package-topology.md) for the
full graph and rationale.

## Rust conventions (the native accelerator)

The optional build accelerator lives in the `crates/*` Cargo workspace — just two
crates, `vibe_bundler` and `vibe_napi`. These conventions are the Rust analog of
the TypeScript ones above — match them the same way.

### Crate structure

- **One responsibility per crate.** Each crate does one job: `vibe_bundler` is the
  oxc-based static analyzer (extracting `import` declarations and agent→tool edges
  for `@vibe/build`), and `vibe_napi` is the napi-rs binding that exposes that
  analysis to JS. This mirrors "one cohesive concept per file" on the TS side.
- **Module docs with `//!`.** Every crate and module opens with a `//!` doc comment
  stating what it owns — the Rust equivalent of the package barrel telling you the
  public surface.
- **`#![forbid(unsafe_code)]`** at the crate root. `vibe_bundler` is a pure-safe
  Rust library. The only exception is the FFI crate, `vibe_napi`, which needs
  `unsafe` at the napi-rs language boundary.

### Snapshot tests with insta

Test the extracted import/edge output with `insta` snapshots (the way TS behavior
is pinned with Vitest and types with tsd). Review intentional changes with
`cargo insta review`; commit the accepted `.snap` files with your code.

### Formatting & linting

`rustfmt` and `clippy` are to Rust what Biome is to the TypeScript packages: the
non-negotiable formatter and linter, enforced in CI. Run `cargo fmt` and
`cargo clippy --all-targets -D warnings` (warnings are errors) before pushing.

### The crate graph rule

The crate dependency graph is **acyclic and directional**, exactly like the
`packages/*` graph: `vibe_bundler` is the pure-Rust analysis library, and
`vibe_napi` sits on top of it as the FFI front end that surfaces it to JS. A crate
depends *down*, never up.
