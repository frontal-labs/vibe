---
title: "Roadmap"
description: "A milestone-oriented view of where Vibe is going. This is the *outcome* map — what"
---

# Roadmap

A milestone-oriented view of where Vibe is going. This is the *outcome* map — what
becomes true at each step — not a task list. For the ordered engineering work and
exit gates, see the [Build plan](./01-build-plan.md); for the code-level model →
agent detail, see the [Agentic implementation plan](./02-agentic-implementation-plan.md).

Vibe is a **TypeScript-native agent framework**: apps are plain TypeScript (`.ts`)
that compose the `@vibe/*` packages — you import and call `createSystem`,
`defineTool`, and `createAgent` from `@vibe/core`. There is no separate language to
learn: everything is a typed function call. So the map has a single track — the
**runtime** (`@vibe/*`, TypeScript, M0–M6) — built up milestone by milestone.

Milestones are cumulative: each one assumes the previous is green. Every milestone
ships with `tests/` + `type-tests/` and keeps `bun ci:check` passing.

## At a glance

The `M` track maps directly to the build-plan phases.

| Milestone | Theme | Maps to phase(s) | Headline capability unlocked |
|---|---|---|---|
| **M0** | Base is stable | [Phase 0](./01-build-plan.md#phase-0--stabilize-the-base-blocker) | The repo is trustworthy — CI runs, config is committed, docs exist |
| **M1** | Model layer | [Phase 1](./01-build-plan.md#phase-1--model-layer-vibemodel) | Call a real Anthropic model through a typed provider |
| **M2** | Tools + memory | [Phase 2](./01-build-plan.md#phase-2--tools-layer-vibetools), [Phase 3](./01-build-plan.md#phase-3--memory-layer-vibememory) | Define typed tools; hold a budgeted conversation |
| **M3** | Agent loop — `ask()` works | [Phase 4](./01-build-plan.md#phase-4--agent-layer-vibeagent), [Phase 5](./01-build-plan.md#phase-5--wire-coreask), [5b](./01-build-plan.md#phase-5b--config-resolver-vibeconfig) | **`createSystem(...).ask("…")` returns a real answer** |
| **M4** | Multi-agent | [Phase 6](./01-build-plan.md#phase-6--multi-agent) | A coordinator delegates scoped subtasks to sub-agents |
| **M5** | DX, scaffolder, examples | [Phase 7](./01-build-plan.md#phase-7--hardening--dx-polish) | Bootstrap a working agent app in one command |
| **M6** | 1.0 | (post-Phase 7) | Depend on Vibe in production, versioned |

The `M` track is the runtime and framework (TypeScript). Each milestone builds on the
package(s) the previous one delivered; 1.0 requires the whole track green.

---

## M0 — Base is stable

**Goal.** Make the foundation trustworthy before a single agentic package is added.
The infrastructure (`shared`, `errors`, `di`, `lifecycle`, `logger`, `plugin`,
`runtime`, `core`) is already implemented and tested — this milestone is about
finishing the in-flight config refactor and closing the process gaps the
[current-state audit](../analysis/03-current-state-audit.md) flags.

**Headline deliverable.** A committed, coherent centralized-config tree
(`packages/typescript-config`, `packages/biome-config`, root `tsconfig.json` +
Vitest workspace), a green `bun ci:check` on `master`, **and a fixed CI branch
trigger** (`main` → `master`) so CI actually runs. See
[Release & versioning](./04-release-and-versioning.md#the-branch-trigger-bug).

**You can now…** trust that a red build means a real problem — every push is
linted, typechecked, built, and tested on the actual default branch, on a clean
working tree.

## M1 — Model layer

**Goal.** Give Vibe a typed door to a language model: the `ModelProvider`
interface and the Anthropic reference provider (default `claude-opus-4-8`,
adaptive thinking, `effort`, streaming for large outputs, refusal handling).

**Headline deliverable.** `@vibe/model` — the provider interface, the Anthropic
implementation with request/response normalization and HTTP-status → `@vibe/errors`
mapping, and a **deterministic fake provider** for tests. See the
[Model & provider layer](../architecture/10-model-provider-layer.md).

**You can now…** send a normalized `ModelRequest` and get a normalized
`ModelResponse` back — either from Anthropic (guarded by `ANTHROPIC_API_KEY`) or
from the scripted fake provider, with typed errors instead of raw HTTP failures.

## M2 — Tools + memory

**Goal.** Give the model things to *do* and something to *remember*. These two
packages proceed in parallel once `@vibe/model`'s types exist.

**Headline deliverable.** `@vibe/tools` — `defineTool({ schema, execute })` where
one Zod schema both types the handler args and emits the model-facing JSON Schema,
plus a registry and a runtime-backed execution adapter (timeout, cancellation,
errors → `tool_result(is_error)`). And `@vibe/memory` — an append-only
`Conversation` and a `buildRequest` that assembles `system + messages + tools`
within a token budget. See [Tools & MCP](../architecture/11-tools-and-mcp.md) and
[Memory & context](../architecture/12-memory-and-context.md).

**You can now…** define a typed tool, register it, execute it end-to-end through
the runtime, and round-trip a conversation through the request builder — all
without an agent loop yet.

## M3 — Agent loop — the "hello agent" milestone

**Goal.** Assemble M1 + M2 into the run loop and remove the `ask()` stub. This is
the milestone where Vibe stops being infrastructure and starts being a product.

**Headline deliverable.** `@vibe/agent` — the loop (build request → model call via
runtime → stop-reason branch → parallel tool execution → append → iterate) with a
`maxIterations` ceiling, cancellation checks between steps, `stream()` of
`AgentEvent`s, and per-run trace ids — then `core.ask()` wired to construct and run
the default agent. See [The agent loop](../architecture/09-agent-loop.md).

**You can now…**

```ts
import { createSystem } from "@vibe/core"

const system = createSystem({ name: "support-bot" })
await system.start()
const answer = await system.ask("What's the status of order #1024?")
```

…get a **real answer**, with a custom `defineTool` tool called by the model and its
typed result flowing back. The [quickstart](../dx/03-quickstart.md) runs verbatim.

## M4 — Multi-agent

**Goal.** Let an agent hand a scoped subtask to another agent.

**Headline deliverable.** A built-in `delegate` tool / coordinator that spawns a
sub-agent with its own model, prompt, and tools and returns its result, with trace
ids nested under the parent run and cheap-model (`claude-haiku-4-5`) sub-agents for
fan-out. One level of delegation to start. See
[Multi-agent](../architecture/13-multi-agent.md).

**You can now…** build a coordinator that decomposes a task, delegates pieces to
specialized (and cheaper) sub-agents, and integrates the results — with logs that
show the nested traces.

## M5 — DX, scaffolder, examples

**Goal.** Make the framework fast to adopt.

**Headline deliverable.** An `examples/` workspace (support bot, research agent), a
`create-vibe` scaffolder, and generated API reference kept in lockstep with the
types.

**You can now…** run one command to get a working, typed agent app — provider
wired, a sample tool defined, tests and type-tests in place — instead of assembling
it by hand.

## M6 — 1.0

**Goal.** Commit to a stable public surface for the `@vibe/*` framework.

**Headline deliverable.** A `1.0.0` release of the `@vibe/*` packages with a
documented stability policy covering the public API surface, a perf pass complete,
and Changesets-driven release automation — versioning the TypeScript packages in
lockstep — proven on `master`. See
[Release & versioning](./04-release-and-versioning.md).

**You can now…** depend on Vibe in production — import `@vibe/*`, ship your app —
and rely on semver: breaking changes to the framework API arrive only in major
versions, with changelogs generated from Changesets.
