# Manifesto

## The thesis

Building an AI agent today means gluing an LLM SDK to a pile of ad-hoc plumbing:
retry loops copied from Stack Overflow, a `try/catch` that swallows provider
errors, a `Map` pretending to be a service container, `console.log` pretending to
be observability, and a lifecycle that is really just "the process is running,
probably." The interesting part — the agent — is 5% of the code. The other 95% is
undifferentiated infrastructure that every team rebuilds, badly.

**Vibe's bet: the infrastructure should be a framework, and the framework should
be TypeScript-native, type-safe to the edges, and modular enough that you pay only
for what you use.**

We are not building "another LangChain." We are building the runtime that a serious
agentic application deserves — the thing you would build in-house on your third
agent project, extracted, hardened, and typed.

**And it is a framework, not a DSL.** Vibe is TypeScript-native to the core: you
import `vibe/*` and write ordinary `.ts`. First-class constructs — agents, tools,
models, memory, plugins, config — are plain functions you call (`defineAgent`,
`defineTool`, `defineConfig`, `createSystem`) with full type inference, not a
separate syntax you have to learn or a compiler you have to run. Your app *is*
TypeScript: it type-checks with `tsc`, runs on `node`/`bun`, and every
architectural guarantee (the [agent loop](../architecture/09-agent-loop.md), typed
errors, the durable runtime) holds because you're using the documented runtime
directly. The only native code in the repo is an **optional build accelerator**
(the oxc-based `vibe_bundler` and its `vibe_napi` binding) that lets
[`vibe/build`](../architecture/02-package-topology.md) code-split tools for
smaller cold starts — the framework works without it.

## What "agentic TypeScript framework" means here

An agent is a loop: a model decides, calls tools, observes results, and decides
again, until it is done. That loop is deceptively simple to demo and genuinely hard
to run in production. Production means:

- **Cancellation** — a user closed the tab; stop cleanly, release resources.
- **Retries with backoff** — the provider returned a 529; don't hammer it.
- **Timeouts** — a tool call hung; bound it.
- **Structured errors** — a 400 vs a 429 vs a tool bug are three different
  problems with three different responses.
- **Observability** — every model call, tool call, token count, and latency is a
  log line with a trace id, not a `console.log`.
- **Lifecycle** — resources initialize in order and shut down in reverse, once.
- **Extensibility** — teams add their own tools, providers, and hooks without
  forking.

Vibe already has the hard parts of that list — [`runtime`](../architecture/05-runtime-execution.md)
(cancellation, retry, resource limits, checkpoints), [`lifecycle`](../architecture/04-lifecycle.md),
[`errors`](../architecture/07-errors.md), [`logger`](../architecture/08-logging-observability.md),
[`di`](../architecture/03-dependency-injection.md), and [`plugin`](../architecture/06-plugin-system.md).
The [agent loop](../architecture/09-agent-loop.md) is designed to sit *on top* of
them, not reinvent them.

## The non-negotiables

1. **Type safety is not optional.** Tool inputs and outputs, model responses,
   service tokens, and errors are all typed. If the compiler can catch it, the
   compiler catches it. Branded types (`ServiceToken<T>`, `Brand<...>`) prevent
   whole classes of mistakes. See [Type safety](../dx/02-type-safety.md).

2. **Modularity is enforced by the dependency graph.** `shared` depends on
   nothing. `core` depends on everything. The layers between are acyclic and
   independently installable. You can use `vibe/runtime` without `vibe/agent`.
   See [Package topology](../architecture/02-package-topology.md).

3. **The happy path is one line; the escape hatch is always there.**
   `createSystem({ name }).ask("...")` works with zero ceremony. When you need to
   control the model, register a custom tool, or intercept the loop, every layer
   is a public, documented seam.

4. **Provider-agnostic core, Claude-first defaults.** The [model layer](../architecture/10-model-provider-layer.md)
   is an interface. The reference implementation is Anthropic's SDK with sensible
   defaults (`claude-opus-4-8`, adaptive thinking, streaming for long outputs).
   Swapping providers is a config change, not a rewrite.

5. **Errors are values with codes.** No stringly-typed error handling. Every
   failure is a `VibeError` subclass with a machine-readable code, so retry logic,
   telemetry, and user-facing messages can all branch correctly.

6. **Observability is built in, not bolted on.** The [logger](../architecture/08-logging-observability.md)
   carries context (trace ids, agent ids, token usage) through the whole loop.

## Why now

The model layer finally makes this worth it. Adaptive thinking, structured
outputs, server-side tools, MCP, and long context turn "call an LLM" into "run an
agent" — and the gap between a demo and a production agent has never been wider.
The teams shipping agents are all solving the same infrastructure problems in
parallel. Vibe is the shared answer.

## The measure of success

Vibe succeeds when a developer can:

- Add `vibe/*` to a project, write a TypeScript file with a `defineTool` and a
  `defineAgent`, and run it with `bun`/`node` — a tool-using agent from nothing in
  under five minutes.
- Add a custom tool with full type inference and zero boilerplate.
- Swap `claude-opus-4-8` for `claude-haiku-4-5` on a sub-agent with one line.
- Read a production incident straight from structured logs with trace ids.
- Trust that cancellation, retries, and shutdown "just work" because the runtime
  owns them.

That is the whole game: make the 95% disappear so the 5% can shine.

See [Positioning & landscape](./01-positioning-and-landscape.md) for how this
compares to what exists today.
