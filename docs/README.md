# Vibe Documentation

> A pure-TypeScript framework for building production AI agents. You write plain
> TypeScript against the `vibe/*` packages and it runs on a durable, typed runtime.

Vibe is **a TypeScript framework** — a bun + Turborepo monorepo of `vibe/*`
packages under `packages/`. You compose agents, tools, models, memory, and plugins
from first-class TypeScript APIs that run on the runtime (dependency injection, a
lifecycle state machine, a plugin system, a durable execution runtime, structured
errors, and structured logging). Apps built with Vibe are ordinary TypeScript
projects — there is no separate source language to learn.

```ts
// support.ts
import { defineTool, defineAgent, createSystem } from "@frontal-labs/vibe"
import { db } from "./db"                          // your own TypeScript

const getOrder = defineTool({
  name: "GetOrder",
  input: z.object({ orderId: z.string() }),
  async run({ orderId }) {
    const order = await db.orders.find(orderId)
    return order ?? { status: "not_found" }
  },
})

const support = defineAgent({
  name: "Support",
  model: "claude-opus-4-8",
  system: "You are a concise support agent. Use tools before guessing.",
  tools: [getOrder],
})

const system = createSystem({ agents: [support] })
```

That is the whole application. You wire agents to tools by composition; `vibe/build`
statically analyzes the imports to code-split tools into lazily-loaded chunks for
small cold starts.

This documentation set describes what Vibe is, the problems it solves, its
architecture, its developer experience, and the concrete plan to build the
agentic layer that turns the current infrastructure skeleton into "the first and
best agentic TypeScript framework."

## How to read this

Start with **Vision** for the "why", then **Analysis** for the honest current
state, then **Architecture** for the "how". **Plan** is the actionable build
sequence.

### Vision — why Vibe exists
- [Manifesto](./vision/00-manifesto.md) — the thesis, the bet, the non-negotiables.
- [Positioning & landscape](./vision/01-positioning-and-landscape.md) — how Vibe differs from LangChain, LlamaIndex, Mastra, the Vercel AI SDK, and raw SDKs.

### Analysis — the honest state of the code
- [Framework analysis](./analysis/00-framework-analysis.md) — package-by-package assessment of what exists today.
- [Problems we solve](./analysis/01-problems-we-solve.md) — the ecosystem pain points Vibe targets.
- [Bottlenecks & trade-offs](./analysis/02-bottlenecks-and-tradeoffs.md) — where the hard limits are and what we chose.
- [Current-state audit](./analysis/03-current-state-audit.md) — concrete issues, gaps, and cleanup targets, with severity.

### Architecture — how it fits together
- [Overview](./architecture/00-overview.md) — the layered picture and the request path.
- [Core concepts](./architecture/01-core-concepts.md) — System, Agent, Model, Tool, Plugin, Lifecycle.
- [Package topology](./architecture/02-package-topology.md) — the dependency graph and layering rules.
- [Dependency injection](./architecture/03-dependency-injection.md)
- [Lifecycle](./architecture/04-lifecycle.md)
- [Runtime & execution](./architecture/05-runtime-execution.md)
- [Plugin system](./architecture/06-plugin-system.md)
- [Errors](./architecture/07-errors.md)
- [Logging & observability](./architecture/08-logging-observability.md)
- [The agent loop](./architecture/09-agent-loop.md) — the heart of the agentic layer.
- [Model & provider layer](./architecture/10-model-provider-layer.md)
- [Tools & MCP](./architecture/11-tools-and-mcp.md)
- [Memory & context](./architecture/12-memory-and-context.md)
- [Multi-agent](./architecture/13-multi-agent.md)
- [Configuration & bootstrap](./architecture/14-configuration-and-bootstrap.md) — the `vibe` package and `vibe.config.{ts,js,…}`.

### Developer experience
- [DX principles](./dx/00-developer-experience.md)
- [API design](./dx/01-api-design.md)
- [Type safety](./dx/02-type-safety.md)
- [Quickstart](./dx/03-quickstart.md)

### Specs
- [Agent spec](./specs/agent-spec.md)
- [Tool spec](./specs/tool-spec.md)
- [Model spec](./specs/model-spec.md)

### Plan
- [Roadmap](./plan/00-roadmap.md) — phased delivery.
- [Build plan](./plan/01-build-plan.md) — the ordered engineering work.
- [Agentic implementation plan](./plan/02-agentic-implementation-plan.md) — the model → tools → agent → multi-agent build.
- [Testing strategy](./plan/03-testing-strategy.md)
- [Release & versioning](./plan/04-release-and-versioning.md)

### Contributing
- [Contributing](./contributing/00-contributing.md)
- [Conventions](./contributing/01-conventions.md)

## Status at a glance

| Layer | Package(s) | State |
|---|---|---|
| Foundations | `shared`, `errors`, `di`, `lifecycle`, `logger` | ✅ Implemented |
| Orchestration | `plugin`, `runtime` | ✅ Implemented |
| Composition root | `core` | ✅ Wired; `ask()` stubbed |
| Agentic layer | `model`, `tools`, `agent`, `memory` | 🚧 Planned — see [Agentic implementation plan](./plan/02-agentic-implementation-plan.md) |
| Framework front door | `config`, `vibe` (meta) | 🚧 Planned — see [Configuration & bootstrap](./architecture/14-configuration-and-bootstrap.md) |
| Bundler accelerator (Rust) | `crates/vibe_bundler`, `crates/vibe_napi` | ✅ oxc-based tool-edge extraction for `vibe/build` (optional native accelerator) |

The infrastructure is real and tested. The agentic layer is designed here and not
yet built. `system.ask()` throws `notImplementedError` on purpose — this
documentation is the blueprint for making it work.

## Conventions used in these docs

- Model IDs follow the current Anthropic catalog. The default model is
  `claude-opus-4-8`; adaptive thinking (`thinking: { type: "adaptive" }`) is the
  default reasoning mode. See [Model spec](./specs/model-spec.md).
- Code marked 🚧 is proposed API, not yet in `packages/`. Code without a marker
  reflects what exists today.
- Package names use the `vibe/*` scope as declared in each `package.json`.
