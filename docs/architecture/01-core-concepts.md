# Core Concepts

The nouns of Vibe. A handful of these exist in code today; the agentic ones are
defined here and built per the [implementation plan](../plan/02-agentic-implementation-plan.md).

## System (exists)
The top-level container. `vibe.system({ name, logLevel?, plugins? })` returns a
`System` that owns a DI container, a lifecycle, a logger, a plugin host, and a
runtime. It exposes `init()`, `start()`, `stop()`, and `ask()`. This is the
composition root — the one object an application holds.

```ts
interface System {
  readonly name: string
  readonly info: SystemInfo
  readonly logger: Logger
  readonly plugins: PluginHost
  readonly runtime: Runtime
  init(): Promise<void>
  start(): Promise<void>
  stop(timeoutMs?: number): Promise<void>
  ask(prompt: string): Promise<string>   // 🚧 currently throws notImplementedError
}
```

## Lifecycle (exists)
A typed state machine: `created → initializing → ready → stopping → stopped`, plus
`errored`. Transitions are idempotent (calling `start()` when `ready` is a no-op;
`stop()` when `stopped` is a no-op). Plugins hook `onBefore`/`onAfter` on the
`init`/`start`/`stop` events. See [Lifecycle](./04-lifecycle.md).

## Container & ServiceToken (exists)
Dependency injection. `createToken<T>(name)` mints a **branded** `ServiceToken<T>`
that carries its value type. The container registers instances/factories against
tokens and resolves them type-safely. The System registers itself, its logger,
lifecycle, and plugin host as tokens so the agentic layer can resolve them. See
[Dependency injection](./03-dependency-injection.md).

## Runtime, Execution, Task (exists)
The durable execution engine. A **Task** is a registered handler; an **Execution**
is one run of it, identified by a branded `ExecutionId`, with retry, cancellation
(`CancellationToken`), timeout, progress, checkpoints, and streaming. A
**ResourceManager** enforces named concurrency limits. The agent loop schedules
model and tool calls as executions. See [Runtime & execution](./05-runtime-execution.md).

## Plugin & Hooks (exists)
A `Plugin` has a `manifest` (name, version, deps) and a `setup(hooks)` method. The
`PluginHost` registers plugins (dependency-ordered), starts them up, and shuts them
down. Hooks fire around lifecycle events and (in the agentic layer) around agent
events. See [Plugin system](./06-plugin-system.md).

## VibeError (exists)
The base error. Every failure is a subclass with a machine-readable **code** (see
`error-codes.ts`) and serializable fields. Factories (`notImplementedError`,
`timeoutError`, `cancelledError`, …) construct them. Retry logic, telemetry, and
user messaging all branch on the code, never on a string. See [Errors](./07-errors.md).

## Logger & Context (exists)
Leveled, structured logging with a context store carrying `defaultMeta` (e.g.
`{ system: name }`) and per-call metadata. Transports pluggable. The agent loop
threads a trace id and token usage through it. See [Logging & observability](./08-logging-observability.md).

---

## The agentic nouns (planned)

### Model & ModelProvider (🚧 `@vibe/model`)
A **ModelProvider** is the interface the loop depends on: `generate(request)` and
`stream(request)`, taking messages + tool schemas + options, returning content
blocks + `stopReason` + `usage`. The reference implementation wraps
`@anthropic-ai/sdk` with `claude-opus-4-8` and adaptive thinking as defaults. A
**Model** is a provider bound to a specific model id + options. See
[Model & provider layer](./10-model-provider-layer.md).

### Tool & ToolRegistry (🚧 `@vibe/tools`)
A **Tool** is a name + description + input schema (Zod) + a typed `execute`
handler. Defining it once yields both the model-facing JSON Schema and the
handler's argument types. The **ToolRegistry** holds the tools available to an
agent. MCP servers surface as tools through an adapter. See [Tools & MCP](./11-tools-and-mcp.md).

### Agent (🚧 `@vibe/agent`)
An **Agent** binds a model, a system prompt, a tool set, and memory, and exposes
`run(input)` — the [agent loop](./09-agent-loop.md). `system.ask()` delegates to a
default agent. Agents can delegate to sub-agents. See [Multi-agent](./13-multi-agent.md).

### Memory & Conversation (🚧 `@vibe/memory`)
**Conversation** is the ordered message history for one run. **Memory** is
optional cross-run persistence. Both feed the request builder and respect context
limits (with compaction/context-editing hooks). Built on `shared`'s context-store.
See [Memory & context](./12-memory-and-context.md).

### The Vibe language & compiler (🚧 `@vibe/compiler`, `vibe` CLI)
The **surface** developers actually write. A `.vibe` file declares agents, tools,
models, memory, plugins, and config with first-class syntax; the **`vibe`
compiler** lexes/parses/checks it and **emits TypeScript** that calls the runtime
constructs above (`createSystem`, `createAgent`, `defineTool`, …). You never import
the framework — the compiler writes the wiring, the way `tsc` writes JavaScript.
The `vibe` CLL (`new`/`dev`/`build`/`check`/`fmt`), a language server, and an editor
extension complete the toolchain. **VibeConfig** — the resolved wiring (name, model,
provider, tools, plugins, memory, logging, runtime limits) — comes from a `config { }`
block in `.vibe` (or a `vibe.config.ts` escape hatch). See
[The Vibe language](../language/00-overview.md) and
[Configuration & the compiler entry points](./14-configuration-and-bootstrap.md).

## How the nouns compose

```
System
 ├─ container ── resolves ──▶ ModelProvider, ToolRegistry, Memory, Logger
 ├─ lifecycle ── drives ────▶ provider/MCP init & shutdown
 ├─ runtime   ── executes ──▶ each model call, each tool call
 ├─ plugins   ── extend ────▶ tools, providers, hooks
 └─ ask() ──▶ default Agent.run()
                 └─ loop: Model ⇄ Tools, over Memory, through Runtime, logged
```
