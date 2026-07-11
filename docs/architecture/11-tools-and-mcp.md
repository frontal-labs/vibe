# Tools & MCP

> 🚧 Planned — package `@vibe/tools`. The tool contract the [agent loop](./09-agent-loop.md)
> executes, plus the MCP adapter and server-side (provider) tools.

A tool is the model's way of doing something in the world. Vibe's tool layer has one
opinionated job: **define a tool once, from a single Zod schema, and get both the
model-facing JSON Schema and the fully-typed handler for free.** No hand-written
JSON Schema drifting away from the handler signature; no `any` in the execute body.

Every tool call runs as a [`@vibe/runtime`](./05-runtime-execution.md) execution, so
tools inherit cancellation, timeout, and named concurrency limits — and a thrown
tool error becomes a `tool_result` returned to the model, never an exception thrown
out of the loop.

## The Tool contract

```ts
import type { z } from "zod"
import type { CancellationToken, Logger } from "@vibe/runtime"

interface Tool<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly name: string                       // model-visible, unique in a registry
  readonly description: string                // the model reads this — write it well
  readonly schema: TSchema                     // the ONE source of truth
  execute(args: z.infer<TSchema>, ctx: ToolContext): Promise<ToolResult>

  // optional runtime policy
  readonly concurrencyLimit?: string          // ResourceManager limit name, e.g. "http"
  readonly timeoutMs?: number
  readonly readOnly?: boolean                 // side-effect-free ⇒ safe to run in parallel
}

interface ToolContext {
  readonly cancellationToken: CancellationToken  // cooperative cancellation
  readonly signal: AbortSignal                   // for fetch/db clients that want an AbortSignal
  readonly logger: Logger                        // pre-bound to the run's trace id
  readonly trace: string                         // trace id for nested spans / sub-agents
}

type ToolResult =
  | { isError?: false; content: string | ContentBlock[] }
  | { isError: true;   content: string }         // returned to the model, not thrown

interface ToolSchema {                            // the model-facing shape
  name: string
  description: string
  input_schema: JSONSchema                        // emitted from the Zod schema
}
```

`ContentBlock` is the same union the [model layer](./10-model-provider-layer.md)
uses, so a tool can return text today and richer blocks later without a new type.
`ToolContext` is deliberately small: the `cancellationToken` and `signal` come
straight from the runtime execution wrapping the call, and `logger`/`trace` come
from the agent run.

## `defineTool` — one schema, two consumers

`defineTool` is the whole ergonomic story. You pass a Zod schema; `z.infer` types
the `execute` args, and `zod-to-json-schema` emits the `input_schema` the provider
sends to the model. **The types can never drift, because there is only one schema.**

```ts
import { z } from "zod"
import { defineTool } from "@vibe/tools"

export const getWeather = defineTool({
  name: "get_weather",
  description:
    "Get the current weather for a city. Returns temperature in the requested unit.",
  schema: z.object({
    city: z.string().describe("City name, e.g. 'Lisbon'"),
    unit: z.enum(["celsius", "fahrenheit"]).default("celsius"),
  }),
  concurrencyLimit: "http",
  timeoutMs: 10_000,
  readOnly: true,

  //          ▼ args is inferred: { city: string; unit: "celsius" | "fahrenheit" }
  async execute(args, ctx) {
    ctx.logger.debug("fetching weather", { city: args.city })
    const res = await fetch(
      `https://api.example.com/weather?q=${encodeURIComponent(args.city)}`,
      { signal: ctx.signal },              // cancellation flows to the HTTP client
    )
    if (!res.ok) {
      // A thrown error is fine — the loop turns it into an isError tool_result.
      throw new Error(`weather API returned ${res.status}`)
    }
    const data = (await res.json()) as { tempC: number }
    const temp = args.unit === "fahrenheit" ? data.tempC * 1.8 + 32 : data.tempC
    return { content: `${Math.round(temp)}°${args.unit === "fahrenheit" ? "F" : "C"}` }
  },
})
```

Two things happen to that one `schema`:

```ts
// 1. To the handler — compile-time, via z.infer:
type Args = z.infer<typeof getWeather.schema>
//   { city: string; unit: "celsius" | "fahrenheit" }

// 2. To the model — run-time, via zod-to-json-schema (in the request builder):
getWeather.toSchema()
// {
//   name: "get_weather",
//   description: "Get the current weather for a city. ...",
//   input_schema: {
//     type: "object",
//     properties: {
//       city: { type: "string", description: "City name, e.g. 'Lisbon'" },
//       unit: { type: "string", enum: ["celsius","fahrenheit"], default: "celsius" },
//     },
//     required: ["city"],
//   },
// }
```

The `.describe()` calls and `.default()` flow through to the JSON Schema, so the
prose the model sees and the constraints it must satisfy live next to the type. This
is why Vibe standardizes on **one Zod schema** rather than a separate description
object.

## The ToolRegistry

An agent is given a `ToolRegistry`: the set of tools it may call. The registry
rejects duplicate names, exposes lookup by name for the loop, and emits the
deterministic, sorted schema list the request builder needs for
[prompt-cache stability](./12-memory-and-context.md#prompt-cache-friendly-assembly).

```ts
interface ToolRegistry {
  register(tool: Tool): void                  // throws on duplicate name
  get(name: string): Tool | undefined
  has(name: string): boolean
  list(): Tool[]
  toSchemas(): ToolSchema[]                    // sorted by name — stable cache prefix
}

const registry = createToolRegistry([getWeather /*, ... */])
```

`toSchemas()` sorts by name so the tool block in the request prefix is byte-stable
across turns — any reordering would invalidate the provider's prompt cache.

## Running a tool as a runtime execution

The loop never calls `tool.execute` directly. It calls `runToolCall`, which
schedules the handler as a [runtime execution](./05-runtime-execution.md) so the
call gets timeout, cancellation, and — when the tool declares a `concurrencyLimit`
— a `ResourceManager.acquire` around the body.

```ts
async function runToolCall(
  tool: Tool,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  // Validate the model's arguments against the same schema before running.
  const parsed = tool.schema.safeParse(input)
  if (!parsed.success) {
    // Bad arguments come back to the model as an error it can correct — not a throw.
    return { isError: true, content: `invalid arguments: ${parsed.error.message}` }
  }

  const handle = tool.concurrencyLimit
    ? await runtime.resources.acquire(tool.concurrencyLimit, limitFor(tool), {
        timeoutMs: tool.timeoutMs,
      })
    : undefined
  try {
    return await runtime.execute(toolTaskId, { tool, args: parsed.data, ctx }, {
      timeoutMs: tool.timeoutMs,
    })
  } catch (err) {
    // A handler throw (or a TimeoutError) becomes an isError result the model sees.
    return { isError: true, content: serializeToolError(err) }
  } finally {
    handle?.release()
  }
}
```

The named limit is the important bit. If the model emits ten parallel `get_weather`
calls, all ten acquire the `"http"` limit, so the framework opens *N* connections,
not ten thousand:

```ts
// Ten parallel weather calls, but at most (say) 4 concurrent HTTP requests.
await runtime.resources.acquire("http", 4)
```

## Error semantics: throw ⇒ `isError`, not a loop crash

This is the rule that keeps agents robust:

| What happens in the tool | What the model sees | Does the loop stop? |
|---|---|---|
| `execute` returns `{ content }` | `tool_result` with the content | No — iterate |
| `execute` **throws** | `tool_result` with `isError: true` + message | No — model can recover/re-plan |
| Arguments fail Zod validation | `tool_result` with `isError: true` | No — model can correct the call |
| Tool exceeds `timeoutMs` | `tool_result` with `isError: true` (`TimeoutError`) | No |
| Run is cancelled | `CancelledError` | **Yes** — propagates, releases resources |
| Runtime itself fails | typed `VibeError` | **Yes** — infrastructure failure |

A tool *failing* is a normal event the model reasons about; the runtime *failing*
or the caller *cancelling* is an exceptional event the loop propagates. Keeping
these two distinct is what lets an agent gracefully retry a flaky API call instead
of aborting the whole run.

## Parallel execution → one results message

When the model returns several `tool_use` blocks in a turn, the loop runs the
side-effect-free ones (`readOnly: true`) concurrently, awaits **all** of them, and
appends **every** `tool_result` in a **single** message:

```ts
const calls = response.content.filter(isToolUse)
const results = await Promise.all(
  calls.map((c) => runToolCall(registry.get(c.name)!, c.input, ctx)),
)
conversation.appendToolResults(results)   // ONE message, all results, order preserved
```

Splitting results across multiple messages degrades the model's parallel-tool-call
behavior on subsequent turns, so the single-message rule is load-bearing, not a
convenience. See the [agent loop](./09-agent-loop.md#tool-execution).

## The MCP adapter — surface MCP tools as Tools

[Model Context Protocol](https://modelcontextprotocol.io) servers expose their own
tools over a transport (stdio, HTTP/SSE). The MCP adapter connects to a server,
lists its tools, and wraps each one as an ordinary Vibe `Tool` — so from the loop's
point of view an MCP tool is indistinguishable from a local one.

```ts
import { mcpToolset } from "@vibe/tools/mcp"

// Connect on system start; the connection is a lifecycle resource (init/stop).
const fsTools = await mcpToolset({
  transport: { type: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/data"] },
  namespace: "fs",            // tools become "fs.read_file", "fs.list_dir", ...
})

registry.registerAll(fsTools)  // now the agent can call them like any other tool
```

What the adapter does per MCP tool:

- **Schema bridge.** The MCP tool's advertised JSON Schema becomes the `input_schema`
  directly. When possible it is wrapped in a Zod schema (`z.object(...)`) so the same
  validate-before-execute path applies; otherwise validation defers to the server.
- **Namespacing.** Server tools are prefixed (`fs.read_file`) to avoid collisions
  across servers and with local tools.
- **Execution.** `execute` proxies the call over the MCP transport as a runtime
  execution — same cancellation, timeout, and (optional) concurrency limit as a
  native tool. A server error comes back as an `isError` result.
- **Lifecycle.** The MCP connection is opened on `init`/`start` and closed on
  `stop`, participating in the [lifecycle](./04-lifecycle.md) like any other
  resource.

The [model layer](./10-model-provider-layer.md) notes an alternative: when the
provider supports the MCP connector natively, the server can be passed through as an
`mcp_toolset` instead of bridged locally. The adapter is the portable default;
the connector is an optimization where the platform offers it.

## Server-side (provider) tools

Some tools run **inside the provider**, not in your process: web search, code
execution, and similar server-side tools. You declare them in the request's tool
list, but you never write an `execute` — the provider runs them and streams their
results back as content.

The one thing the loop must honor is **`pause_turn`**. A server-side tool loop can
return `stop_reason: "pause_turn"` (normalized by the provider to `StopReason "pause"`)
meaning "I'm mid-task, re-send to continue." The loop treats `pause` as: append what
came back and immediately re-send to resume — no tool execution on your side.

```ts
if (response.stopReason === "pause") {
  conversation.appendAssistant(response.content)   // includes server-tool results so far
  continue                                          // re-send to let the server tool finish
}
```

| Tool kind | Where it runs | You implement `execute`? | Loop handling |
|---|---|---|---|
| Native (`defineTool`) | Your process, via runtime | Yes | `tool_use` → run → `tool_result` |
| MCP (adapter) | MCP server, proxied | No (adapter proxies) | `tool_use` → proxy → `tool_result` |
| Server-side (provider) | Provider infrastructure | No | results as content; honor `pause_turn` |

## Where this sits

```
Agent.run
  └─ request builder ── registry.toSchemas() (sorted) ──▶ ModelRequest.tools
        model returns tool_use blocks
  └─ loop ── runToolCall ──▶ @vibe/runtime execution
                              ├─ native   → tool.execute(args, ctx)
                              ├─ mcp       → proxy over transport
                              └─ (server-side tools resolve inside the provider)
```

See the [Tool spec](../specs/tool-spec.md) for the exhaustive contract, the
[agent loop](./09-agent-loop.md) for how results feed the next iteration, and
[Memory & context](./12-memory-and-context.md) for how the tool schema list is
assembled into a cache-friendly request.
