---
title: "Architecture Overview"
description: "Vibe is a layered monorepo. Each layer depends only on layers below it. The"
---

# Architecture Overview

Vibe is a layered monorepo. Each layer depends only on layers below it. The
foundations are built and tested; the agentic layer is designed here and planned
in [the agentic implementation plan](../plan/02-agentic-implementation-plan.md).

## The layers

```
┌───────────────────────────────────────────────────────────────┐
│  core          vibe.system({...}) — composition root & ask()   │
├───────────────────────────────────────────────────────────────┤
│  AGENTIC LAYER (planned)                                        │
│  agent   →  the tool-use loop, agent runtime, state            │
│  tools   →  typed tool definitions, registry, MCP bridge       │
│  memory  →  conversation + long-term memory, context windows   │
│  model   →  provider interface + Anthropic reference provider  │
├───────────────────────────────────────────────────────────────┤
│  ORCHESTRATION                                                  │
│  plugin  →  plugin host, hooks (before/after lifecycle)        │
│  runtime →  scheduler, retry, cancellation, resources, checkpts│
├───────────────────────────────────────────────────────────────┤
│  FOUNDATIONS                                                    │
│  di      →  container + branded ServiceToken<T>                 │
│  lifecycle → state machine (created→ready→stopped)             │
│  logger  →  levels, context, transports                        │
│  errors  →  VibeError hierarchy + codes + factories            │
│  shared  →  Brand, guards, context-store, version (no deps)    │
└───────────────────────────────────────────────────────────────┘
```

Boxes with **planned** are the packages the agentic build adds: `@vibe/model`,
`@vibe/tools`, `@vibe/agent`, `@vibe/memory`. Everything else exists today.

## The request path: `system.ask(prompt)`

Today `ask()` throws. Here is the path it will take once the agentic layer lands
(each step maps to an existing or planned seam):

```
system.ask("What's the status of order #1024?")
   │
   ▼
[core] resolve the default Agent from the DI container
   │
   ▼
[agent] run the loop:
   1. build a request (system prompt + messages + tool schemas)   ← memory
   2. call the model                                              ← model provider
   3. if stop_reason == "tool_use": execute tool calls           ← tools
        · each tool call runs through the runtime                 ← runtime (retry, cancel, limits)
   4. append tool results, go to 2
   5. if stop_reason == "end_turn": return the text
   │
   ▼
every step emits structured logs with a trace id                  ← logger
every failure is a typed VibeError with a code                    ← errors
plugins observe/extend via hooks                                  ← plugin
```

See [The agent loop](./09-agent-loop.md) for the detailed design.

## How the foundations serve the agent loop

| Foundation | What the agent loop gets from it |
|---|---|
| [`di`](./03-dependency-injection.md) | Resolve the model provider, tool registry, memory, and logger by token — no manual wiring, testable via swaps. |
| [`lifecycle`](./04-lifecycle.md) | Providers, MCP connections, and tool resources initialize/stop in order, once. |
| [`runtime`](./05-runtime-execution.md) | Each model call and tool call is an execution with cancellation, retry, timeout, and concurrency limits. |
| [`errors`](./07-errors.md) | 429 vs 400 vs tool failure are distinct typed errors driving distinct behavior. |
| [`logger`](./08-logging-observability.md) | Trace ids, token usage, latency, and tool timings flow as structured context. |
| [`plugin`](./06-plugin-system.md) | Teams add tools, providers, and hooks without forking core. |

## Design invariants

1. **Acyclic dependencies.** Enforced by the graph in [Package topology](./02-package-topology.md).
   The agentic packages may depend on foundations/orchestration, never the reverse.
2. **The runtime owns execution semantics.** The agent loop does not implement its
   own retry/cancellation — it schedules work through `@vibe/runtime`.
3. **The model layer is an interface.** The loop depends on `ModelProvider`, not on
   `@anthropic-ai/sdk` directly. See [Model & provider layer](./10-model-provider-layer.md).
4. **Everything observable is logged with context.** No bare `console.log` in
   library code.
5. **Everything fallible returns a typed error.** No `throw new Error("...")` in
   library code — use the [error factories](./07-errors.md).

## Where to go next

- The nouns: [Core concepts](./01-core-concepts.md).
- The graph and layering rules: [Package topology](./02-package-topology.md).
- The heart of the system: [The agent loop](./09-agent-loop.md).
