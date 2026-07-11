# Logging & Observability — `@vibe/logger`

`@vibe/logger` is structured, leveled logging with two features that make it a real
observability substrate rather than a `console.log` wrapper: **default metadata**
(bound per-logger, merged into every entry) and an **`AsyncLocalStorage`-backed
correlation id** that threads through async call stacks without being passed by
hand. The agent loop uses both to attach a per-run trace id, token usage, and tool
timings to every line it emits.

## `LogLevel`

```ts
export enum LogLevel {
  Trace = 0, Debug = 10, Info = 20, Warn = 30, Error = 40, Fatal = 50,
}
```

Numeric levels so filtering is a comparison: an entry logs iff its level is `>=` the
logger's configured level (default `Info`, so `trace`/`debug` are dropped unless you
lower the threshold). `logLevelFromString("warn")` / `logLevelToString(level)`
convert to/from the six names (`logLevelFromString` accepts `"warning"` too and
falls back to `Info` for anything unrecognized).

## `Logger`

```ts
export interface Logger {
  trace(message: string, meta?: LogMeta): void
  debug(message: string, meta?: LogMeta): void
  info(message: string, meta?: LogMeta): void
  warn(message: string, meta?: LogMeta): void
  error(message: string, meta?: LogMeta): void
  fatal(message: string, meta?: LogMeta): void
  child(meta: LogMeta): Logger
}
```

`createLogger(options?)` takes `{ level?, transports?, defaultMeta? }`:

```ts
export interface LoggerOptions {
  level?: LogLevel
  transports?: Transport[]
  defaultMeta?: LogMeta
}
```

Every `log(...)` call builds a `LogEntry` by merging `{ ...defaultMeta, ...meta }`
(per-call meta wins on key collision), stamping an ISO `timestamp`, pulling the
current `correlationId` from context (below), and fanning the entry out to each
transport.

### Structured metadata and `LogMeta`

`LogMeta` is `{ readonly [key: string]: unknown }` — an open structured bag, not a
formatted string. Metadata is the payload; the message is a label. This is what
makes logs queryable:

```ts
logger.info("model call complete", {
  traceId, iteration: 3, model: "claude-opus-4-8",
  inputTokens: 1_820, outputTokens: 420, durationMs: 640,
})
```

### `child(meta)` and `defaultMeta`

`child(meta)` returns a new `Logger` that shares the parent's level and transports
but carries `{ ...parentDefaultMeta, ...meta }` as its default metadata. This is the
scoping primitive: derive `system.logger.child({ traceId })` at the top of a run and
every line from that child is automatically tagged — no threading the trace id
through every function. `core` seeds the root logger with
`defaultMeta: { system: config.name }`, so **every** log line already knows which
system it came from (see [Lifecycle wiring](./04-lifecycle.md#how-core-wires-plugins-into-the-lifecycle)).

## Correlation context

Distinct from `defaultMeta` (bound at construction), the **correlation id** flows
through the async call stack via `AsyncLocalStorage` — built on the
[`ContextStore<T>` from `@vibe/shared`](./02-package-topology.md):

```ts
export interface LogContext {
  correlationId?: string
  [key: string]: unknown
}

export function runWithLogContext<R>(context: LogContext, fn: () => R | Promise<R>): Promise<R>
export function getCorrelationId(): string | undefined
```

Wrap a unit of work in `runWithLogContext({ correlationId }, fn)`, and **every**
`logger.*` call inside `fn` — however deep the async stack — picks up that
`correlationId` automatically, stamped onto the `LogEntry`. No logger needs to be
passed down to correlate lines. This is the mechanism behind a per-request or
per-run trace id.

## `LogEntry` and transports

The normalized record a transport receives:

```ts
export interface LogEntry {
  readonly level: LogLevel
  readonly message: string
  readonly meta: LogMeta
  readonly timestamp: string
  readonly correlationId: string | undefined
}

export interface Transport { log(entry: LogEntry): void }
```

A `Transport` is any `{ log(entry) }` sink, so structured output goes wherever you
point it. The shipped one is `createConsoleTransport()`, which formats
`[timestamp] [LEVEL] [correlation: …] message {meta-json}` and routes to the right
`console` method by level (`console.debug` for trace/debug, `.info`, `.warn`,
`.error` for error/fatal). `createLogger` defaults to a single console transport if
you pass none; supply your own array to fan out to a JSON/file/OTel sink. All
transports receive every entry that passes the level filter.

## How the agent loop threads observability through

🚧 The [agent loop](./09-agent-loop.md#observability) uses this package as its
observability spine:

1. **Trace id per run.** `Agent.run` opens a `runWithLogContext({ correlationId:
   traceId }, …)` (or derives a `child({ traceId })` logger), so every model call,
   tool call, and error in that run correlates automatically.
2. **Token usage.** After each model call the loop logs the
   [`TokenUsage`](./10-model-provider-layer.md) (`inputTokens`, `outputTokens`,
   cache reads/writes) as structured `meta` — aggregatable across iterations.
3. **Tool timings.** Each tool call is a [runtime execution](./05-runtime-execution.md),
   and its `ExecutionResult` carries `durationMs`, `attempts`, and state; the loop
   logs tool `name` + `durationMs` + success as structured fields.
4. **Coded errors.** Failures log the [`VibeError.code`](./07-errors.md) as a field,
   so dashboards aggregate `VIBE_PROVIDER_RATE_LIMITED` vs `VIBE_TOOL_EXECUTION_FAILED`
   by code, never by regexing message text.

The result is the invariant from the [overview](./00-overview.md#design-invariants):
a production incident is readable straight from the logs — filter by `traceId`,
read the iteration-by-iteration story with token counts, tool durations, and typed
error codes inline. No bare `console.log` in library code; everything observable is
logged with context.
