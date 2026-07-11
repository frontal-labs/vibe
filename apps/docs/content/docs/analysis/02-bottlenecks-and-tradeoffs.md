---
title: "Bottlenecks & Trade-offs"
description: "A framework that wants to be the best starts by being honest about its limits. The"
---

# Bottlenecks & Trade-offs

A framework that wants to be the best starts by being honest about its limits. The
[Manifesto](../vision/00-manifesto.md) sells the upside; this page is the fine
print. It covers the hard physical limits Vibe cannot repeal (they belong to the
model and the network), the deliberate design trade-offs Vibe makes (where we
picked a side on purpose), and the things Vibe explicitly does **not** solve.

Read this alongside the [framework analysis](./00-framework-analysis.md), which
grounds several of these in the current code, and the
[current-state audit](./03-current-state-audit.md), which ranks the fixable gaps.

## Legend

- 🧱 **Hard limit** — physics of LLMs/networks; Vibe manages it, cannot remove it.
- ⚖️ **Deliberate trade-off** — a choice with a real cost we accepted for a reason.
- 🚫 **Out of scope** — Vibe does not try to solve this.

---

## 🧱 LLM latency dominates everything

A model call is hundreds of milliseconds to tens of seconds. An agent run is many
calls in sequence — the model can't decide step *n+1* until it has observed the
result of step *n* — so the loop is **fundamentally serial in its critical path**.
No amount of framework engineering makes a five-turn agent faster than five model
round-trips plus the tool work between them.

What Vibe does: it removes *added* latency and makes the unavoidable latency
observable and cancellable. Streaming (🚧 `@vibe/model`) surfaces tokens as they
arrive so time-to-first-token, not time-to-completion, is what the user feels;
`@vibe/runtime` cancellation lets you abandon a slow run cleanly; the
[logger](../architecture/08-logging-observability.md) records per-call latency so
you can find the slow step. What Vibe does **not** do: make the model think faster.
Adaptive thinking (`thinking: { type: "adaptive" }`, the default) trades latency
for quality *on purpose* — harder prompts get more reasoning and take longer, and
that is a knob, not a bug.

## 🧱 Tokens cost money and context windows are finite

Every message, tool schema, and thinking block is tokens, and tokens are billed.
Long-running agents accumulate conversation history until it either costs a fortune
or overflows the context window. This is a hard economic and physical ceiling.

What Vibe does: `@vibe/memory` (🚧) owns the request builder and conversation
history and is designed with compaction / context-editing hooks so history can be
summarized or trimmed before it overflows; prompt caching (below) cuts the cost of
the stable prefix. The defaults help too — `effort` (not raw `budget_tokens`) and
streaming large outputs keep spend proportional to difficulty. What Vibe does
**not** do: make tokens free or the window infinite. Compaction is lossy by
nature — summarizing history trades fidelity for fit, and no framework escapes that
trade. See [Memory & context](../architecture/12-memory-and-context.md).

## ⚖️ The agent loop needs an iteration ceiling

An agent is a loop that runs "until it's done." Left truly open-ended, a model can
loop forever — calling the same tool, oscillating between two, or never emitting
`end_turn`. So the [agent loop](../architecture/09-agent-loop.md) (🚧 `@vibe/agent`)
will enforce a **maximum-iteration bound**.

The trade-off is unavoidable and it cuts both ways: too low a ceiling truncates
legitimately hard, multi-step tasks; too high a ceiling lets a stuck agent burn
tokens and time before anyone notices. Vibe's stance is that the ceiling is an
explicit, configurable value with a typed failure (a `VibeError` when it's hit),
not an implicit "hope it stops." You choose the ceiling; you own the consequence of
the choice. Bounded-but-sometimes-truncated beats unbounded-and-sometimes-runaway.

## ⚖️ Parallel tool execution vs. resource limits

When a model requests several tool calls in one turn, running them in parallel is
faster — but unbounded parallelism blows past provider rate limits, exhausts
connection pools, and can OOM the process (see
[Problems we solve](./01-problems-we-solve.md#10-unbounded-parallel-tool-calls-melt-the-provider)).

Vibe's `@vibe/runtime` `ResourceManager` is a named semaphore that bounds
concurrency per resource pool, which resolves the safety half of the tension. The
trade-off it leaves you is a **tuning problem, not a correctness one**: set the
limit too low and you serialize work that could have been parallel; too high and you
reintroduce the overload you were bounding. There is no universally correct number —
it depends on the provider's limits and your tools' dependencies. Two honest caveats
about today's code: the engine does **not** auto-acquire from the manager (the loop
must call `acquire` explicitly), and independent tool calls are not yet scheduled
with automatic parallelism — the primitives exist; the wiring is part of the
agentic build.

## ⚖️ Provider-agnostic core vs. Claude-first defaults

Vibe's non-negotiable is that the loop depends on a `ModelProvider` interface, not
on `@anthropic-ai/sdk` directly, so swapping providers is a config change, not a
rewrite. But its *defaults* are unapologetically Claude-first: `claude-opus-4-8`,
adaptive thinking, `effort` rather than `budget_tokens`, **no** `temperature` /
`top_p` / `top_k`, and streaming for large outputs (see the
[model layer](../architecture/10-model-provider-layer.md)).

This is a genuine trade-off. An interface broad enough to be truly provider-agnostic
tends toward a lowest-common-denominator shape; defaults tuned for one provider's
best practice are *correct* for that provider and *leaky* for others. A provider
without adaptive thinking, or one that expects `temperature`, will need adapter code
to map onto Vibe's opinions. Vibe accepts that: the interface is the portability
guarantee, and the defaults being right out of the box for the reference provider is
worth more than defaults that are mediocre everywhere. You are not pinned to Claude —
but the path of least resistance points at it, by design.

## ⚖️ Strict layering vs. convenience

Vibe's dependency graph is a rule, not a suggestion:
`shared → errors → di/lifecycle/logger → plugin/runtime → agentic → core`, acyclic
and enforced by `package.json`. This is the framework's best asset — you can adopt
one layer without the rest, and there are no cycles to reason around (see
[Package topology](../architecture/02-package-topology.md)).

The cost is real ergonomic friction:

- **No back-references.** `@vibe/shared` cannot depend on `@vibe/errors`, so its
  guards throw bare `TypeError`, not `VibeError`. A lower layer can never reach up.
- **Indirection.** Getting a shared capability where it's needed means DI or
  interface-passing, not a convenient import — more ceremony than a monolith.
- **Duplication over coupling.** Rather than let two packages share a type by
  depending on each other, the graph sometimes prefers a small duplication (the
  runtime re-declares a `SerializedError` shape locally, for instance).

We take that friction on purpose. The alternative — a bag of features with implicit
coupling — is exactly the "kitchen-sink framework" Vibe positions against.

## 🧱 Prompt-cache stability constrains what can change per turn

Prompt caching makes long, stable prefixes cheap — but only if the prefix is
**byte-stable**. Caching keys on an exact prefix match, so anything that mutates the
front of the request (reordering tools, editing the system prompt, injecting a
timestamp near the top) invalidates the cache and re-bills the whole prefix.

This constrains the design more than it first appears: the request builder (🚧
`@vibe/memory`) must keep the stable prefix — system prompt, tool schemas — fixed
and append new turns at the end; context compaction, which by definition rewrites
history, is in direct tension with cache stability and must be applied
deliberately, not every turn. Vibe's stance is to make the prefix stable by default
and treat compaction as an occasional, explicit operation. The trade-off — cache
savings vs. the freedom to rewrite history freely — is inherent to how caching
works and cannot be abstracted away.

## ⚖️ Monorepo build complexity

Twelve packages (eight built, four planned) under bun workspaces + Turborepo +
Biome + Vitest + tsup + Changesets + Husky/commitlint is more machinery than a
single package. The payoff is independent installability and enforced layering; the
cost is a build graph and a toolchain a contributor must understand before shipping
a one-line change, plus the ever-present risk of config drift across a dozen
`tsconfig.json`s.

That risk is not hypothetical today: the repo is mid-flight on an **uncommitted**
move to shared config packages (`packages/biome-config`, `packages/typescript-config`,
a root `vitest.config.ts` / `tsconfig.json`), which is exactly the kind of
half-applied change a monorepo makes easy to leave dangling. It is the 🔴 blocker in
the [current-state audit](./03-current-state-audit.md#-uncommitted-config-refactor-is-mid-flight),
and it must be finished and committed before the agentic packages are added —
otherwise they're built on shifting sand. The complexity is the price of the
modularity; keeping it coherent is ongoing work, not a one-time setup.

## 🧱 "Durable" is a design promise, not yet a runtime property

The [framework analysis](./00-framework-analysis.md#viberuntime) is explicit about
this and it is the single most important expectation to set: `@vibe/runtime`'s
executions, results, and checkpoints live in in-memory `Map`s. The API is *shaped*
for durability — `ExecutionId`, `checkpoint()`, `resumeFromCheckpoint`,
`ExecutionResult` — but today:

- state does not survive a process restart;
- `resumeFromCheckpoint` re-runs the task with the checkpointed state as input
  rather than resuming mid-handler;
- `stream()` buffers progress and emits it after completion rather than live.

So the runtime buys you in-process retry, cancellation, timeouts, concurrency
limits, and structured results — which is most of what an agent loop needs — but
**not** cross-process durability. A persistent-store-backed engine is future work,
and until it lands, "durable" should be read as "structured and observable," not
"survives a crash." Naming this clearly is the point of an honest analysis.

---

## What Vibe explicitly does NOT solve

Restating the boundaries from
[Positioning & landscape](../vision/01-positioning-and-landscape.md), plus the ones
that fall out of the trade-offs above:

- 🚫 **Retrieval / RAG.** Vibe is not a vector store or a RAG library. Retrieval is
  a *tool* or *plugin* concern — bring your own store and expose it as a
  [tool](../architecture/11-tools-and-mcp.md).
- 🚫 **UI / rendering.** Vibe runs agents; it does not render them. Pair it with a
  UI/streaming layer (the Vercel AI SDK is a fine companion).
- 🚫 **No-code / visual authoring.** Vibe is a library for engineers who want the
  infrastructure solved and the control kept, not a drag-and-drop product.
- 🚫 **Model quality, hallucination, or alignment.** Vibe is the runtime *around*
  the model. If the model reasons poorly, hallucinates a tool argument, or refuses,
  that is a prompt/model/evaluation problem — Vibe makes the failure observable and
  typed, but it does not fix the model.
- 🚫 **Guaranteed cost or latency ceilings.** Vibe gives you the knobs — iteration
  bounds, concurrency limits, compaction, model selection per sub-agent — and the
  observability to tune them. It cannot promise a fixed bill or a fixed p99; those
  are emergent from your prompts, your tools, and the provider.
- 🚫 **Cross-process durable execution — *yet*.** See the section directly above.
  This one is on the roadmap; the rest are permanent non-goals.

## The honest summary

Vibe removes the *undifferentiated* 95% — retry, cancellation, timeouts, typed
errors, lifecycle, DI, plugins, structured logging, concurrency limits, and a
structured execution substrate. It does **not** repeal the physics of LLMs (latency,
token cost, finite context) or the economics of running them, and it deliberately
declines to be a RAG library, a UI framework, or a no-code tool. The trade-offs —
Claude-first defaults, strict layering, an iteration ceiling, cache-stable
prefixes, monorepo complexity, and an in-memory-durable runtime — are choices made
in the open, each with a cost we named and accepted. That honesty is the point: you
should adopt Vibe knowing exactly where its guarantees end.
