---
title: "Positioning & Landscape"
description: "Vibe occupies a deliberate gap: **more structure than a raw SDK, less magic than a"
---

# Positioning & Landscape

Vibe occupies a deliberate gap: **more structure than a raw SDK, less magic than a
kitchen-sink framework, and typed end-to-end.**

## The landscape

| Tool | What it is | Where it hurts |
|---|---|---|
| **Raw provider SDK** (`@anthropic-ai/sdk`) | The metal. Full control. | You rebuild retry, cancellation, lifecycle, DI, logging, tool loops, and multi-agent from scratch — every project. |
| **LangChain / LangGraph (JS)** | Batteries-included chains/graphs. | Large surface area, abstraction churn, weak type inference on tool I/O, Python-first ergonomics ported to TS. |
| **LlamaIndex.TS** | Retrieval/RAG-first. | Optimized for data/RAG; agent runtime and ops concerns are secondary. |
| **Vercel AI SDK** | Excellent model/streaming/UI abstraction. | Deliberately thin on the *system* concerns — no DI, lifecycle, plugin system, resource manager, or opinionated multi-agent runtime. Great primitive; not a system framework. |
| **Mastra** | TS agent framework with workflows. | Closest peer. Vibe differentiates on strict layering, branded-type safety, an explicit lifecycle state machine, and a first-class durable runtime (checkpoints, resource limits, cancellation tokens). |
| **In-house glue** | Whatever your team wrote. | Unshared, untested, rebuilt per project. This is Vibe's real competitor. |

## Vibe's differentiators

### 1. Strict, acyclic layering you can actually see
Most frameworks are a bag of features with implicit coupling. Vibe's dependency
graph is a rule, enforced by `package.json` and checked in CI: `shared` → `errors`
→ `di`/`lifecycle`/`logger` → `plugin`/`runtime` → agentic layer → `core`. You can
adopt one layer without the rest. See [Package topology](../architecture/02-package-topology.md).

### 2. A real lifecycle, not a vibe
`created → initializing → ready → stopping → stopped` (plus `errored`) is a typed
state machine with idempotent transitions and auto-completing stop. Plugins hook
`before`/`after` on `init`/`start`/`stop`. Nothing else in the TS agent space
models process lifecycle this explicitly. See [Lifecycle](../architecture/04-lifecycle.md).

### 3. A durable execution runtime under the agent loop
Cancellation tokens, retry policies with jittered backoff, a resource manager with
concurrency limits, checkpoints, and streamable executions already exist in
[`vibe/runtime`](../architecture/05-runtime-execution.md). The agent loop *uses*
these instead of reinventing them — so agent runs get cancellation, retry, and
backpressure for free.

### 4. Type safety to the edges
- `ServiceToken<T>` — branded, type-carrying DI tokens.
- `Brand<string, ...>` — nominal typing for ids (`ExecutionId`, `TaskId`, `AgentId`).
- Tool schemas defined once (Zod) infer both the model-facing JSON Schema and the
  handler's TypeScript argument types. See [Tools & MCP](../architecture/11-tools-and-mcp.md).
- Errors are typed subclasses with codes, not `any`.

### 5. Provider-agnostic, Claude-first
The [model layer](../architecture/10-model-provider-layer.md) is an interface with
an Anthropic reference provider. Defaults track the current best practice:
`claude-opus-4-8`, adaptive thinking, streaming for large outputs, MCP support.
Nothing pins you to one vendor, but the defaults are correct out of the box.

## What Vibe is *not*

- **Not a RAG library.** Retrieval is a tool/plugin concern, not the core. Bring
  your own vector store as a tool.
- **Not a UI framework.** Vibe runs agents; render however you like. (The Vercel
  AI SDK is a fine rendering companion.)
- **Not a no-code product.** It is a library for engineers who want the
  infrastructure solved and the control retained.

## The one-sentence positioning

> **Vibe is the production runtime for TypeScript agents: the durable, typed,
> modular infrastructure you'd build in-house — already built.**
