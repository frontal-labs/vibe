# Tool Spec

> 🚧 Planned — package `vibe/tools`. The authoritative contract for the `Tool`
> interface, its context and result types, the single-Zod-schema inference rule,
> `isError` semantics, parallel-safety and resource limits, and naming rules.
> Consistent with [Tools & MCP](../architecture/11-tools-and-mcp.md) and the tool
> handling in [The agent loop](../architecture/09-agent-loop.md#tool-execution).
> Companion specs: [Agent spec](./agent-spec.md), [Model spec](./model-spec.md).

A **Tool** is the unit of capability an agent can invoke: a name, a description, an
input schema, and a typed `execute` handler. The defining constraint of Vibe's tool
layer is that a tool is described **once** and that description drives both the
model-facing schema and the handler's static types.

## The `Tool` interface

```ts
interface Tool<TInput = unknown, TOutput = unknown> {
  readonly name: string
  readonly description: string
  readonly schema: ToolSchema<TInput>          // Zod schema; source of truth for TInput
  execute(input: TInput, ctx: ToolContext): Promise<TOutput>
}
```

You do not usually write this interface by hand — you call `defineTool`, which
infers `TInput` from the Zod schema so the interface's generics are filled in for
you:

```ts
import { defineTool } from "vibe/tools"
import { z } from "zod"

export const getWeather = defineTool({
  name: "get_weather",
  description: "Get the current weather for a city.",
  schema: z.object({
    city: z.string().describe("City name, e.g. 'Lisbon'."),
    units: z.enum(["c", "f"]).default("c"),
  }),
  async execute(args, ctx) {
    // args: { city: string; units: "c" | "f" } — inferred, no cast.
    return { tempC: 22, description: "clear" }
  },
})
```

## The single-Zod-schema inference rule

**One Zod schema, two consumers. There is no second declaration of the input
shape.**

1. **Handler args** come from `z.infer<typeof schema>`. The `execute` parameter is
   typed to exactly the schema's inferred type — add, remove, or rename a field and
   the handler body stops compiling until it matches.
2. **The model-facing JSON Schema** (`ToolSchema` in the model request's `tools`
   array) is produced by converting the same Zod schema (via `zod-to-json-schema`
   or the SDK's Zod helper). This is what the model reads to decide how to call the
   tool.

```
        z.object({ … })   ← the one definition
        /            \
  z.infer            zod → JSON Schema
     │                    │
 execute(args)      tools[] sent to the model
```

Because both derive from one schema, the three things that classically drift apart
— *what the model may send*, *what the handler expects*, and *what gets validated*
— cannot desync. See [Type safety](../dx/02-type-safety.md#3-one-zod-schema--typed-handler-and-json-schema).

Descriptions matter: `.describe()` on fields flows into the JSON Schema and is part
of the prompt the model reads. Write them for the model, not just for humans.

## `ToolContext`

The second argument to `execute`. It threads the run's cooperative-cancellation and
observability into the handler:

```ts
interface ToolContext {
  readonly cancellationToken: CancellationToken  // from vibe/runtime
  readonly signal: AbortSignal                   // for fetch()/AbortController interop
  readonly logger: Logger                        // bound to the run's trace id
}
```

- **`cancellationToken` / `signal`** — a well-behaved handler passes `ctx.signal`
  to `fetch` and checks/awaits cancellation on long work, so a cancelled run stops
  promptly (the [agent loop](../architecture/09-agent-loop.md#iteration-control)
  cancels between steps; the runtime aborts in-flight executions).
- **`logger`** — already carries the run's **trace id**, so tool logs correlate
  with the model calls around them with zero wiring.

## `ToolResult`

Internally, the loop wraps a handler's outcome as a `ToolResult` before turning it
into the model-facing `tool_result` block:

```ts
interface ToolResult {
  readonly toolUseId: string     // correlates with the model's tool_use block
  readonly content: unknown      // the handler's return value (serialized for the model)
  readonly isError: boolean      // true when the handler threw
}
```

A handler returns its output value directly (the `TOutput` above); the loop
constructs the `ToolResult`. You do not build `ToolResult` yourself for the normal
path.

## `isError` semantics

This is the most important behavioural rule, and it matches
[the loop's tool execution](../architecture/09-agent-loop.md#tool-execution):

> **A tool that throws does not crash the run. The thrown error is caught, turned
> into a `tool_result` with `isError: true` carrying the message, and returned to
> the model** — so the agent can recover, retry differently, or re-plan.

```ts
async execute(args, ctx) {
  const order = await db.orders.find(args.orderId)
  if (!order) throw new Error(`No order ${args.orderId}`) // → tool_result { isError: true }
  return order                                            // → tool_result { isError: false }
}
```

- A **thrown** handler error → `is_error: true` tool_result → back to the model.
  This is the expected way to signal a recoverable failure ("that id doesn't
  exist") to the agent.
- **Infrastructure** failures — the runtime itself failing, a timeout, cancellation
  — are *not* swallowed; they propagate out of the loop as typed `VibeError`s (e.g.
  `TimeoutError`, `CancelledError`). See the
  [error taxonomy](../architecture/09-agent-loop.md#error-taxonomy-in-the-loop).

Rule of thumb: **throw to tell the *model* something went wrong; the runtime throws
to tell the *loop* something went wrong.**

## Parallel-safety and resource limits

The model may emit several `tool_use` blocks in a single turn. The loop executes
them **in parallel** and returns **all** `tool_result` blocks in **one** message
(splitting them across messages degrades the model's parallel-call behaviour).
Consequences for tool authors:

- **Design read-only tools to be side-effect-free and concurrency-safe.** They may
  run at the same time as other tools (and other copies of themselves).
- **Bound shared resources with the `ResourceManager`.** Ten parallel tool calls
  must not open ten thousand connections. A handler acquires a named limit so
  concurrency is capped:

```ts
async execute(args, ctx) {
  return runtime.resources.withLimit("http", async () => {  // named concurrency limit
    const res = await fetch(args.url, { signal: ctx.signal })
    return res.json()
  })
}
```

Each tool call is scheduled as a [runtime execution](../architecture/05-runtime-execution.md)
(`runToolCall`), so it inherits timeout, cancellation, and the optional
`ResourceManager.acquire(limit)` for free — see the
[implementation plan](../plan/02-agentic-implementation-plan.md#package-2--vibetools).

## Naming rules

Tool names are part of the model's prompt and must be stable and unambiguous:

| Rule | Reason |
|---|---|
| `snake_case`, `^[a-z0-9_]+$` | Matches provider tool-name conventions; safe across providers. |
| Verb-led, specific (`get_order_status`, not `orders`) | The model picks tools by name + description; specificity improves selection. |
| **Unique within a registry** | The `ToolRegistry` **rejects duplicate names** at registration. |
| Stable across turns | The tool list is part of the cacheable prompt prefix; renames invalidate the [prompt cache](./model-spec.md#prompt-caching-guidance). |
| Deterministic ordering | The registry exposes `toSchemas()` sorted, so the cached prefix survives across turns. |

MCP servers surface as tools through an adapter, mapped into this same `Tool` shape
and namespaced to avoid collisions — see [Tools & MCP](../architecture/11-tools-and-mcp.md)
and the [model spec's MCP notes](./model-spec.md#mcp--server-tools-optional).

## Worked example

A tool that calls an HTTP API, cooperates with cancellation, bounds concurrency,
reports a recoverable failure to the model, and lets an infrastructure failure
propagate:

```ts
import { defineTool } from "vibe/tools"
import { z } from "zod"

export const searchDocs = defineTool({
  name: "search_docs",
  description:
    "Search the internal documentation index and return the top matching passages.",
  schema: z.object({
    query: z.string().min(1).describe("Natural-language search query."),
    limit: z.number().int().min(1).max(20).default(5),
  }),
  async execute(args, ctx) {
    // args: { query: string; limit: number } — fully inferred from `schema`.
    ctx.logger.info("search_docs", { query: args.query, limit: args.limit })

    // Bound outbound concurrency: parallel tool calls share the "http" limit.
    return runtime.resources.withLimit("http", async () => {
      const res = await fetch(
        `https://docs.internal/search?q=${encodeURIComponent(args.query)}&n=${args.limit}`,
        { signal: ctx.signal }, // cancellation propagates to the socket
      )

      // Recoverable, model-facing failure → thrown → tool_result { isError: true }.
      if (res.status === 404) {
        throw new Error(`No index available for query "${args.query}"`)
      }

      // A 5xx here throws a network/HTTP error; if the runtime classifies it as a
      // TimeoutError or the token is cancelled, that propagates OUT of the loop as
      // a typed VibeError rather than becoming a tool_result.
      const hits = (await res.json()) as Array<{ title: string; snippet: string }>
      return { count: hits.length, hits }
    })
  },
})
```

Registering and using it:

```ts
import { createToolRegistry } from "vibe/tools"

const registry = createToolRegistry()
registry.register(searchDocs)              // duplicate names are rejected
const schemas = registry.toSchemas()       // deterministic, sorted → cache-stable

const agent = system.agent({               // 🚧
  model: "claude-opus-4-8",
  system: "Answer using the docs. Cite passages you used.",
  tools: [searchDocs],
})
const { text } = await agent.run({ text: "How do I cancel a run?" })
```

## Testing (per [testing strategy](../plan/03-testing-strategy.md))

- **Round-trip**: define → register → execute returns the expected output.
- **Inference type test**: `execute` args match `z.infer<typeof schema>`;
  reading a field not in the schema is a compile error (`expectError`).
- **`isError`**: a throwing handler yields a `tool_result` with `isError: true` and
  the message, and the run does **not** crash.
- **Cancellation**: a long-running tool aborts promptly when the token is cancelled.
- **Duplicate names**: `registry.register` of a taken name throws.

## Where to go next

- [Tools & MCP](../architecture/11-tools-and-mcp.md) — the registry, MCP adapter,
  and the broader picture.
- [Agent spec](./agent-spec.md) — how tools are dispatched inside the loop.
- [Type safety](../dx/02-type-safety.md) — the single-schema inference, in depth.
