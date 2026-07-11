# Problems We Solve

The [Manifesto](../vision/00-manifesto.md) makes a claim: building an agent today
is 5% agent and 95% undifferentiated infrastructure that every team rebuilds,
badly. This page is the itemized version of that claim. For each pain point: what
it costs you when you glue an LLM SDK to ad-hoc plumbing, and the specific Vibe
package or design that removes it.

Where a solution exists in code today it is described in the present tense and
grounded in [the framework analysis](./00-framework-analysis.md). Where it is part
of the planned agentic layer it is marked 🚧.

## The 95% at a glance

| Pain (the DIY tax) | Vibe's answer | State |
|---|---|---|
| Retry loops copied from Stack Overflow | `@vibe/runtime` — `executeWithRetry`, jittered backoff, `retryable`-aware | ✅ |
| "The tab closed" → no clean stop | `@vibe/runtime` — `CancellationToken` / `AbortController` | ✅ |
| A hung tool call with no bound | `@vibe/runtime` — per-execution `timeoutMs` | ✅ |
| Stringly-typed `catch (e)` | `@vibe/errors` — `VibeError` + `ErrorCode` + `retryable`/`fatal` | ✅ |
| "Is the process ready?" ambiguity | `@vibe/lifecycle` — explicit state machine | ✅ |
| Tool inputs/outputs typed as `any` | `@vibe/tools` — Zod schema → JSON Schema + inferred handler types 🚧 | 🚧 |
| `console.log` as observability | `@vibe/logger` — leveled, structured, correlation-id context | ✅ |
| A `Map` pretending to be a container | `@vibe/di` — branded `ServiceToken<T>`, scopes, cycle detection | ✅ |
| No seam to extend without forking | `@vibe/plugin` — host + hooks + dependency validation | ✅ |
| Unbounded fan-out melts the provider | `@vibe/runtime` — `ResourceManager` semaphore | ✅ |
| No durable substrate under the loop | `@vibe/runtime` — executions, checkpoints, streaming (in-memory today) | ✅ / partial |

---

## 1. Everyone rebuilds retry and backoff — badly

**The pain.** The provider returns a `529` or a `429`, and the fix is a retry loop
someone pasted from Stack Overflow: fixed delay, no jitter (so every client retries
in lockstep and hammers the provider), no cap, and — worst — it retries a `400`
that will never succeed and swallows a cancellation that should stop immediately.

**How Vibe solves it.** `@vibe/runtime`'s `executeWithRetry` is the one retry
implementation. `defaultRetryPolicy()` is exponential (`backoffMultiplier: 2`,
`initialDelayMs: 200`, capped at `maxDelayMs: 10_000`) with ~10% jitter via
`calculateDelay`, and — critically — it does not retry blindly. `isRetryableError`
returns `false` for `AbortError` and `CancelledError`, and otherwise reads the
`retryable` flag straight off the error object. Because every `VibeError` sets that
flag per class (a `ProviderRateLimitError` is `retryable: true`; a `ValidationError`
is `retryable: false`), retry behavior is *correct by construction*, not by the
author of each call site remembering to check. See
[Runtime & execution](../architecture/05-runtime-execution.md).

## 2. "The user closed the tab" has no clean answer

**The pain.** A user abandons a request mid-loop. Naïve code keeps calling the
model and executing tools against a dead session — burning tokens, holding
connections, and mutating state no one is watching. Retrofitting cancellation into
a loop that wasn't built for it means threading a boolean through every function.

**How Vibe solves it.** `@vibe/runtime` gives every execution a `CancellationToken`
backed by `AbortController`. It exposes `cancelled`, `reason`, `onCancelled(listener)`,
and `throwIfCancelled()`. The retry loop checks it before every attempt; even the
backoff `sleep` is cancellable and rejects with a `cancelledError` the instant the
token trips. When the agent loop schedules model and tool calls as executions, it
inherits cancellation for free — the [agent loop](../architecture/09-agent-loop.md)
does not implement its own. Cancelled executions surface as
`ExecutionResult { state: "cancelled" }`, distinct from failures.

## 3. A hung tool call runs forever

**The pain.** A tool hits a slow network dependency and never returns. Without a
bound, the whole agent hangs; with an ad-hoc `Promise.race` bolted on per call
site, the timeout and the underlying work are not linked, so the work keeps running
after the timeout "fires."

**How Vibe solves it.** Executions take a `timeoutMs`. `@vibe/runtime` races the
handler against the timeout *and wires the abort back into the cancellation token*,
so a timeout aborts the in-flight work rather than just abandoning the promise. A
timeout produces a typed `TimeoutError` (which carries `timeoutMs`) — retryable,
non-fatal — so the loop can decide to retry or surface it.

## 4. Errors are strings, so error handling is guesswork

**The pain.** `catch (e) { if (e.message.includes("rate")) ... }`. A `400`, a `429`,
and a bug in your tool are three different problems demanding three different
responses (fail, back off, alert), but a stringly-typed `catch` can't tell them
apart. Telemetry can't aggregate them. Retry logic can't branch on them.

**How Vibe solves it.** `@vibe/errors` makes every failure a `VibeError` subclass
with a machine-readable `ErrorCode` and two behavioral flags — `fatal` and
`retryable` — set per class, plus a serializable `cause` chain (`toJSON`/`fromJSON`).
Retry logic reads `retryable`; telemetry keys on `code`; user messaging branches on
the subclass. The provider- and tool-facing codes
(`VIBE_PROVIDER_RATE_LIMITED`, `VIBE_TOOL_EXECUTION_FAILED`, `VIBE_PROVIDER_AUTH_FAILED`)
already exist, so the agentic layer inherits a correct taxonomy on day one. No
`throw new Error("...")` in library code — use the factories. See
[Errors](../architecture/07-errors.md).

## 5. "Is it running?" is answered by vibes

**The pain.** Lifecycle in most agent code means "the process started, probably."
Resources initialize in whatever order imports happen to resolve; shutdown is a
`process.on("SIGTERM")` that may or may not release connections; calling start
twice double-initializes; calling stop twice throws.

**How Vibe solves it.** `@vibe/lifecycle` is a typed state machine —
`created → initializing → ready → stopping → stopped` (plus `errored`) — with
**idempotent** transitions (start-when-`ready` and stop-when-`stopped` are no-ops
that don't re-fire handlers) and **auto-completing stop** (`stopping` folds to
`stopped` after teardown). `stop()` is time-bounded (default 30s) and moves to
`errored` on timeout. `onBefore` handlers are priority-ordered, so resources
initialize deterministically and — by convention — tear down in reverse. Providers,
MCP connections, and tool resources hook this instead of racing at import time. See
[Lifecycle](../architecture/04-lifecycle.md).

## 6. Tool inputs and outputs are typed `any`

**The pain.** A tool schema is written twice — once as JSON Schema for the model,
once as a TypeScript type for the handler — and the two drift. The handler receives
`args: any`, so a renamed field is a runtime error the compiler could have caught.
This is the single weakest spot in most TS agent stacks, including the big
frameworks (see [Positioning & landscape](../vision/01-positioning-and-landscape.md)).

**How Vibe solves it (🚧).** `@vibe/tools` defines a tool once with a Zod input
schema. That one definition yields *both* the model-facing JSON Schema *and* the
handler's argument type, inferred — no second declaration, no drift. A `ToolRegistry`
holds the tools available to an agent, and MCP servers surface as tools through an
adapter. This is planned, not built; it is designed in [Tools & MCP](../architecture/11-tools-and-mcp.md).
The foundation is already in place: `@vibe/errors` ships `ToolError`
(`VIBE_TOOL_EXECUTION_FAILED`, retryable) so a failing tool is an observable value,
not a crash.

## 7. `console.log` is not observability

**The pain.** When a production agent misbehaves, you get a wall of `console.log`
with no level, no structure, and no way to correlate the lines from one request
across the async calls that produced them. You can't filter, can't ship it to a log
pipeline, and can't answer "what did *this* request do?"

**How Vibe solves it.** `@vibe/logger` is leveled (`Trace`…`Fatal`), structured
(every entry is `{ level, message, meta, timestamp, correlationId }`), and
context-aware: the correlation id is pulled from an `AsyncLocalStorage`-backed
`ContextStore` at log time, so it threads through `await` boundaries without being
passed by hand. `child(meta)` stamps context (`{ system, agent, trace }`) down the
call tree. Transports are pluggable via the `Transport` interface. The rule from the
[architecture overview](../architecture/00-overview.md) is absolute: no bare
`console.log` in library code. (Honest caveat: only a console transport ships
today — file/JSON/OTel transports are a seam, not yet code. See
[Logging & observability](../architecture/08-logging-observability.md).)

## 8. A `Map` is doing dependency injection's job

**The pain.** Wiring is a global `Map<string, any>` or a tangle of imports.
Resolving a service returns `any`, so a typo in a key is a runtime `undefined`.
There's no scoping, no cycle detection, and swapping a real provider for a fake in
tests means monkey-patching a module.

**How Vibe solves it.** `@vibe/di` is a container keyed by branded
`ServiceToken<T>` — the token *carries* its value type, so `resolve(token)` returns
`T` with no cast and a mistyped registration won't compile. It supports `singleton`,
`scoped`, and `transient` lifetimes, parent-chained scopes (`createScope()`), and
throws `diCircularDependency` when a factory re-enters its own token. `@vibe/core`
already registers the container, logger, lifecycle, and plugin host as tokens, so
the agentic layer resolves its dependencies rather than importing them — which is
also what makes the model provider swappable in a test. See
[Dependency injection](../architecture/03-dependency-injection.md).

## 9. Extending the framework means forking it

**The pain.** You need a custom tool, a new provider, or a hook before every model
call. If the framework has no extension seam, you fork it or monkey-patch it, and
now you own a divergent copy.

**How Vibe solves it.** `@vibe/plugin` is a first-class extension point. A `Plugin`
declares a `manifest` (name, version, `dependencies?`) and a `setup(hooks)` method;
the `PluginHost` validates that declared dependencies are present (throwing
`pluginNotFoundError` / `pluginConflictError`), runs `setup`, and dispatches
lifecycle hooks (`onBefore`/`onAfter` on `init`/`start`/`stop`) and named hooks
(`on(name, handler)`). `@vibe/core` registers configured plugins during `start`.
Teams add tools, providers, and behavior without touching core. (Honest caveats:
hook payloads are currently `unknown[]` and the host validates dependency *presence*
but does not topologically *sort* — both noted in the
[framework analysis](./00-framework-analysis.md) and the
[audit](./03-current-state-audit.md).) See [Plugin system](../architecture/06-plugin-system.md).

## 10. Unbounded parallel tool calls melt the provider

**The pain.** The model asks for eight tool calls at once; naïve code fires all
eight in parallel. Multiply by concurrent agents and you blow past provider rate
limits, exhaust a connection pool, or OOM the process. There is no backpressure.

**How Vibe solves it.** `@vibe/runtime`'s `ResourceManager` is a named semaphore.
`acquire(name, limit, { timeoutMs })` bounds concurrency per resource (e.g. a
`"anthropic"` pool or a `"db"` pool), queues waiters, rejects with `timeoutError`
if a waiter waits too long, and drains the queue on `release()`. `getUsage(name)`
reports `{ active, max, pending }` for observability. The agent loop acquires a
handle around each tool/model call so fan-out is bounded rather than best-effort.
(Honest caveat: the manager is available but the engine does not *auto*-acquire —
the loop must call it explicitly. See the
[framework analysis](./00-framework-analysis.md#viberuntime).)

## 11. There's no durable substrate under the loop

**The pain.** An agent run is a long, multi-step, stateful process, but most
implementations model it as a single `async` function. If it fails on step 7,
you restart from step 1 — re-paying every token spent so far. There's no
execution record, no progress, no checkpoint, no way to stream partial results.

**How Vibe solves it.** `@vibe/runtime` models work as **executions**: a registered
`Task` handler runs as an `Execution` with a branded `ExecutionId`, an
`ExecutionContext` (carrying `attempt`, the cancellation token, `progress()`, and
`checkpoint()`), and a typed `ExecutionResult` that records `state`, `attempts`,
`startedAt`, and `durationMs`. Failures return a result rather than throwing, and
`stream()` yields `start → progress* → complete | error` events. The
[agent loop](../architecture/09-agent-loop.md) schedules each model and tool call
as an execution, so it gets retry, cancellation, timeout, and observability from one
substrate. **Honest scope:** "durable" is a design promise the API is shaped for —
today executions, results, and checkpoints live in in-memory `Map`s, so they do not
survive a process restart, and `resumeFromCheckpoint` re-runs rather than resuming
mid-handler. Where that boundary sits, and why, is covered in
[Bottlenecks & trade-offs](./02-bottlenecks-and-tradeoffs.md).

---

## The through-line

Every item above is infrastructure a serious team eventually builds in-house — on
their third agent project, after the first two taught them why. Vibe's bet is that
this layer should be a shared, typed, tested framework so the 95% disappears and the
5% that is *your* agent can shine. The infrastructure for items 1–5 and 7–11 exists
and is tested today; item 6 (typed tool I/O) and the loop that ties them together
are the [agentic layer](../plan/02-agentic-implementation-plan.md) still to build.
