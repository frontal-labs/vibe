# Framework Analysis

A package-by-package assessment of what exists in `packages/` **today**. This is
grounded in the actual source, not the roadmap. For the aspirational picture see
the [Manifesto](../vision/00-manifesto.md); for the honest, severity-ranked issue
list see the [Current-state audit](./03-current-state-audit.md).

Eight packages are built and tested. The four agentic packages (`model`, `tools`,
`memory`, `agent`) are 🚧 planned and appear only in the docs — they are **not**
in `packages/` yet, so they are out of scope here.

## Dependency graph

The eight built packages form a strict, acyclic DAG. Edges are the `dependencies`
declared in each `package.json`.

```
shared        (no deps)
  ▲
  ├── errors ─────────────► (shared)
  │      ▲
  │      ├── di ──────────► (errors, shared)
  │      ├── lifecycle ───► (errors, shared)
  │      └── logger ──────► (errors, shared)
  │              ▲
  │              │  plugin ──► (errors, lifecycle, shared)
  │              │  runtime ─► (errors, lifecycle, shared)
  │              │
  └──────────────┴── core ──► (di, errors, lifecycle, logger, plugin, runtime, shared)
```

| Package | Depends on | Depended on by |
|---|---|---|
| `shared` | — | everything |
| `errors` | `shared` | `di`, `lifecycle`, `logger`, `plugin`, `runtime`, `core` |
| `di` | `errors`, `shared` | `core` |
| `lifecycle` | `errors`, `shared` | `plugin`, `runtime`, `core` |
| `logger` | `errors`, `shared` | `core` |
| `plugin` | `errors`, `lifecycle`, `shared` | `core` |
| `runtime` | `errors`, `lifecycle`, `shared` | `core` |
| `core` | all of the above | — (composition root) |

Two things are worth calling out. `di` and `logger` are **leaves** in the current
graph — only `core` consumes them; the orchestration layer (`plugin`, `runtime`)
does not. And `plugin`/`runtime` both depend on `lifecycle` but not on each other,
which keeps them independently installable. This matches the layering rule in the
[architecture overview](../architecture/00-overview.md): the graph is the
modularity guarantee, not a convention.

---

## `vibe/shared`

**Purpose.** The zero-dependency base. Nominal-typing primitive, common utility
types, runtime guards, an `AsyncLocalStorage` wrapper, and the package version
constant. Everything else builds on this.

**Key exports.**

- `Brand<Base, BrandName>` — the intersection trick (`Base & { readonly __brand: BrandName }`)
  that gives the whole framework its nominal types. `ServiceToken<T>`,
  `ExecutionId`, `TaskId`, `CheckpointId` are all `Brand`s.
- Utility types: `Result<T, E>`, `Maybe<T>`, `Awaitable<T>`, `Fn<A, R>`, `Nullish`.
- Guards: `assertNever`, `assertDefined`, `isDefined`, `isObject`, `isString`,
  `isError`, `isPromise`, `isFunction`.
- `ContextStore<T>` — a typed wrapper over `node:async_hooks` `AsyncLocalStorage`
  with `run`, `get`, `getOrThrow`, `has`, `disable`, `enterWith`.
- `VERSION` — currently `"0.0.0"`.

**Strengths.** Correct and minimal. `Brand` is the load-bearing type in the whole
repo and it is one line. `ContextStore` is the seam that carries the logger's
correlation id (and, later, the agent's trace id) through async boundaries without
threading it by hand.

**Gaps / notes.**

- `Result<T, E>` is defined but not actually used as a return convention anywhere
  yet — the codebase throws `VibeError`s rather than returning `Result`s. It reads
  as intent, not established practice.
- The guards throw bare `TypeError`, not `VibeError` — deliberate, since `shared`
  cannot depend on `errors` (that would create a cycle). Callers in higher layers
  are expected to wrap.
- `VERSION` is a hardcoded literal, not sourced from `package.json`.

---

## `vibe/errors`

**Purpose.** The typed error hierarchy. Every fallible operation in the framework
throws a `VibeError` subclass carrying a machine-readable `code`, so retry logic,
telemetry, and user messaging branch on the code rather than a string.

**Key exports.**

- `ErrorCode` — a string enum of 16 codes (`VIBE_CONFIG_INVALID`,
  `VIBE_PROVIDER_RATE_LIMITED`, `VIBE_TOOL_EXECUTION_FAILED`, `VIBE_TIMEOUT`,
  `VIBE_CANCELLED`, `VIBE_LIFECYCLE_INVALID_TRANSITION`, `VIBE_DI_RESOLUTION_FAILED`,
  `VIBE_NOT_IMPLEMENTED`, …). Note the provider/tool codes already exist — the
  error taxonomy anticipates the agentic layer.
- `VibeError` — base class extending `Error`. Carries `code`, `fatal`, `retryable`,
  and a typed `cause`. Serializable via `toJSON()` / `fromJSON()` (recursive over
  `cause`), plus a `VibeError.isVibeError` type guard.
- Concrete subclasses: `ConfigError`, `RuntimeError`, `ProviderError`,
  `ProviderAuthError`, `ProviderRateLimitError`, `ValidationError`, `ToolError`,
  `TimeoutError` (adds `timeoutMs`), `CancelledError`, `LifecycleError`,
  `NotImplementedError`, `DiResolutionError`, `DiCircularDependencyError`,
  `PluginConflictError`, `PluginNotFoundError`. Each hardcodes its `code`, `fatal`,
  and `retryable` flags.
- Lower-case factory functions (`configError`, `timeoutError`, `cancelledError`,
  `notImplementedError`, `providerRateLimitError`, `diCircularDependency`, …) —
  the idiomatic construction path used everywhere in the codebase.

**Strengths.** The `fatal`/`retryable` flags are set per class, not per call site,
so behavior is consistent: `ProviderRateLimitError` is `retryable: true, fatal: false`;
`CancelledError` is `retryable: false`; `NotImplementedError` is `fatal: true`. The
runtime's `isRetryableError` reads exactly this flag (see `runtime`). Round-trip
serialization with recursive `cause` is genuinely useful for logging and for
carrying errors across execution boundaries.

**Gaps / notes.**

- `ProviderError` (the plain unavailable case) has **no factory function** — you
  must `new ProviderError(...)`. Minor asymmetry.
- The `NotImplementedError` used by `system.ask()` is flagged `fatal: true`,
  which correctly signals "do not retry this stub."

---

## `vibe/di`

**Purpose.** A minimal, type-safe service container with branded tokens. The
System registers itself and its subsystems as tokens so the (future) agentic layer
can resolve them without manual wiring. See [Dependency injection](../architecture/03-dependency-injection.md).

**Key exports.**

- `ServiceToken<T>` — `Brand<string, "ServiceToken"> & { readonly __type: T }`. The
  token is a branded string that also *carries* its value type as a phantom, so
  `resolve(token)` returns `T` with no cast at the call site.
- `createToken<T>(name)` — mints a token as `` `${name}__${counter}` ``.
- `createContainer(parent?)` — returns a `Container` with `register`,
  `registerInstance`, `resolve`, `isRegistered`, `createScope`, `dispose`.
- `ServiceScope` = `"singleton" | "scoped" | "transient"`; `Factory<T>`,
  `Registration<T>` types.

**Strengths.** The three scopes are all implemented: `singleton` (memoized on the
container), `scoped` (memoized per child scope via `createScope()`), `transient`
(fresh each `resolve`). Parent-chained resolution means a scope falls back to its
parent. Circular-dependency detection is real — a `resolving` set throws
`diCircularDependency` if a factory re-enters its own token. Double-registration
throws `diResolutionFailed`.

**Gaps / notes.**

- `createToken` uses a **module-level `let counter = 0`** for uniqueness. This is
  process-local and not collision-safe across module realms (duplicated instances,
  some bundler/test setups). Flagged 🟡 in the [audit](./03-current-state-audit.md#-createtoken-uniqueness-is-process-local);
  a `Symbol`-backed identity would harden it.
- `dispose()` clears the maps but does **not** call any teardown on the resolved
  singletons — resource cleanup is the lifecycle's job, not the container's. Worth
  knowing so no one expects `dispose()` to close connections.
- The two token registrations in `core` (`containerToken`, `lifecycleToken`) are
  created *without* a type parameter, so they resolve as `unknown` — a small typing
  loss compared to `loggerToken`/`pluginHostToken` which are `createToken<T>`.

---

## `vibe/lifecycle`

**Purpose.** A typed state machine for orderly startup and shutdown, with
before/after handlers. This is what makes "initialize in order, shut down in
reverse, once" a guarantee rather than a hope. See [Lifecycle](../architecture/04-lifecycle.md).

**Key exports.**

- `LIFECYCLE_STATES` / `LifecycleState` — `created → initializing → ready → stopping → stopped`,
  plus `errored`.
- `LifecycleEvent` — `"init" | "start" | "stop"`.
- `transitionState(current, event)` / `isValidTransition(current, event)` — the
  transition table and its validator.
- `createLifecycle(initialState?)` — returns a `Lifecycle` with `state` (getter),
  `onBefore(event, handler, { priority? })`, `onAfter(event, handler)`, and the
  `init`/`start`/`stop` drivers.
- `LifecycleHandler` = `() => void | Promise<void>`.

**Strengths.**

- **Idempotent by design.** The transition table maps `start` from `ready` back to
  `ready` and `stop` from `stopped` back to `stopped`; `executeEvent` returns early
  when the state would not change, so handlers do not re-fire. `isValidTransition`
  explicitly allows these no-ops.
- **Auto-complete stop.** `stop` transitions `ready → stopping`, and after the
  after-handlers run, the machine folds `stopping → stopped` automatically. Callers
  do not have to drive a second event.
- **Prioritized before-handlers.** `onBefore` accepts a `priority`; handlers are
  sorted descending, so higher-priority setup runs first. After-handlers run in
  registration order.
- **Bounded shutdown.** `stop(timeoutMs = 30000)` races the stop against a timeout
  and moves the machine to `errored` on failure or timeout.

**Gaps / notes.**

- `init` does **not** auto-fold `initializing → ready`; it leaves the machine in
  `initializing`. In practice `core`'s `start()` calls `init()` then `start()`
  back-to-back, and `start` moves `initializing → ready`. Calling `init()` alone
  leaves you in `initializing` until a `start`.
- Only `stop` has a timeout; `init` and `start` handlers can hang unbounded.
- `after`-handlers are not priority-ordered (only `before` is).

---

## `vibe/logger`

**Purpose.** Leveled, structured logging with a context store that threads a
correlation id through async calls, and pluggable transports. This is the "no bare
`console.log` in library code" enforcement point. See [Logging & observability](../architecture/08-logging-observability.md).

**Key exports.**

- `LogLevel` — numeric enum `Trace(0) → Debug(10) → Info(20) → Warn(30) → Error(40) → Fatal(50)`,
  with `logLevelFromString` / `logLevelToString`.
- `createLogger(options?)` — returns a `Logger` with `trace/debug/info/warn/error/fatal(message, meta?)`
  and `child(meta)`. Level-gated; below-threshold calls short-circuit.
- `Transport` interface + `createConsoleTransport(options?)` (the default when none
  supplied).
- `LogContext`, `logContextStore` (a `ContextStore<LogContext>` from `shared`),
  `getCorrelationId()`, `runWithLogContext(context, fn)`.
- `LogEntry`, `LogMeta`, `LoggerOptions` types.

**Strengths.** `child(meta)` returns a new logger with merged `defaultMeta` and the
same transports/level — this is the mechanism that will stamp `{ system, agent, trace }`
context down the call tree. Correlation id is pulled from the `ContextStore` at log
time, so it flows across `await` boundaries without being passed explicitly. Level
comparison is a numeric `>=`, cheap and correct.

**Gaps / notes.**

- **Only a console transport ships.** The `Transport` seam is real, but file/JSON/OTel
  transports are not written yet — the docs' "transports (plural)" is aspirational
  on the concrete side.
- `createConsoleTransport` accepts a `colorize` option that is **ignored** (the
  parameter is `_options`). Output is a plain formatted string.
- The console transport `switch`es on the **numeric literal** level values
  (`case 0`, `case 10`, …) rather than the `LogLevel` enum members — works, but
  brittle if the enum values ever change.

---

## `vibe/plugin`

**Purpose.** The extension seam. A `PluginHost` registers plugins (validating their
declared dependencies), runs their `setup`, and dispatches lifecycle and named
hooks. This is how teams add tools, providers, and behavior without forking core.
See [Plugin system](../architecture/06-plugin-system.md).

**Key exports.**

- `Plugin` — `{ name, version, manifest, setup(hooks) }`.
- `PluginManifest` — `{ name, version, description, dependencies? }`.
- `PluginHooks` — `on(name, handler)`, `onBefore<K extends LifecycleEvent>(name, handler)`,
  `onAfter<K extends LifecycleEvent>(name, handler)`.
- `HookHandler` = `(...args: unknown[]) => void | Promise<void>`.
- `createPluginHooks()` — the hook registry; internally exposes `execute(name, ...args)`,
  `executeBefore(event)`, `executeAfter(event)`.
- `createPluginHost()` — `register`, `unregister`, `getPlugin`, `getPlugins`,
  `getHooks`, `startup`, `shutdown`.

**Strengths.** Dependency validation is real: `register` throws `pluginNotFoundError`
if a plugin declares a dependency that is not already registered, and
`pluginConflictError` on duplicate names. `setup(hooks)` is awaited, so async plugin
init is supported. `getHooks()` hands back bound `on`/`onBefore`/`onAfter` so
external code can subscribe safely.

**Gaps / notes.**

- **Hooks are untyped by argument.** `HookHandler` is `(...args: unknown[])`. The
  lifecycle hooks are keyed by `LifecycleEvent`, but the payloads are `unknown`.
  When the agentic layer adds `agent:beforeModelCall`-style hooks, they will need a
  typed hook-map. Flagged 🟡 in the [audit](./03-current-state-audit.md#-hooks-are-untyped-by-argument).
- **No topological ordering on registration.** `register` validates that
  dependencies *exist*, but the host does not sort plugins into dependency order —
  it relies on the caller registering them in a valid order (dependencies first).
  The docs describe "dependency-ordered" registration; the enforcement today is
  "dependency-present," not "dependency-sorted."
- `startup()`/`shutdown()` dispatch the literal hook names `"startup"` / `"shutdown"`
  via the generic `execute` path — they are not `LifecycleEvent`s. A plugin must
  `on("startup", ...)` to participate, which is a slightly different surface than
  the `onBefore("start", ...)` lifecycle hooks.
- `unregister` deletes the plugin but does not un-register its hook handlers.

---

## `vibe/runtime`

**Purpose.** The durable execution engine that the agent loop schedules work
through. Cancellation tokens, retry with jittered backoff, timeouts, a resource
manager with concurrency limits, checkpoints, and streamable executions. This is
the framework's most substantial package and, per the audit, its best asset for the
agent loop. See [Runtime & execution](../architecture/05-runtime-execution.md).

**Key exports.**

- Branded ids: `ExecutionId`, `TaskId`, `CheckpointId`.
- `createRuntime()` → `Runtime` — `{ scheduler, resources, registerTask, execute,
  stream, getExecution, createCheckpoint, resumeFromCheckpoint }`.
- `createCancellationTokenSource()` → `{ token, cancel(reason?) }`. The token
  (`AbortController`-backed) exposes `cancelled`, `reason`, `onCancelled(listener)`,
  `throwIfCancelled()`.
- `defaultRetryPolicy()` (`maxAttempts: 3`, `initialDelayMs: 200`, `maxDelayMs: 10_000`,
  `backoffMultiplier: 2`), `calculateDelay(attempt, policy)`, `isRetryableError(error)`,
  `executeWithRetry(fn, options)`.
- `createResourceManager()` → `acquire(name, limit, { timeoutMs? })`, `getUsage(name)`.
- `createScheduler(engine)`, `createExecutionEngine()` (lower-level).
- Types: `TaskDefinition`, `TaskHandler`, `ExecutionContext` (with `progress` and
  `checkpoint`), `ExecutionResult`, `ExecutionState`, `RetryPolicy`, `ScheduleOptions`,
  `StreamEvent`, `Checkpoint`.

**Strengths.**

- **Retry respects the error taxonomy.** `isRetryableError` returns `false` for
  `AbortError` and for anything named `CancelledError`, and otherwise reads the
  `retryable` flag off the error object — i.e. it honors `VibeError.retryable`
  directly. `calculateDelay` applies exponential backoff with ~10% jitter, capped
  at `maxDelayMs`.
- **Cancellation is cooperative and real.** Built on `AbortController`. `sleep`
  during a retry delay is itself cancellable (rejects with `cancelledError`), and
  the timeout race aborts cleanly.
- **Resource manager is a proper semaphore.** `acquire` tracks `active`/`max` per
  named pool, queues waiters, supports an acquisition `timeoutMs` (rejects with
  `timeoutError` and de-queues), and `release()` drains the queue. `getUsage`
  reports `{ active, max, pending }`.
- **Executions never throw on failure.** `execute` catches, distinguishes
  `cancelled` vs `failed` (via `token.cancelled`), serializes the error, and returns
  a typed `ExecutionResult` with `attempts`, `startedAt`, `durationMs`. This is the
  right shape for an agent loop that must observe tool failures rather than crash.
- **Streaming.** `stream()` yields `start → progress* → complete | error` events as
  an `AsyncIterable`.

**Gaps / notes.**

- **Everything is in-memory.** `executions`, `results`, `checkpoints`, and
  `cancellationSources` are plain `Map`s inside the engine closure. "Durable" here
  means *within the process*; there is no persistence, so checkpoints do not survive
  a restart. The API shape anticipates durability, but the current implementation is
  volatile.
- **`resumeFromCheckpoint` re-runs from the top.** It calls `execute(taskId, checkpoint.state)` —
  it feeds the checkpointed state back in as *input* but starts a fresh execution;
  it does not resume mid-handler. `saveCheckpoint` also hardcodes `attempt: 0`.
- **The scheduler and the resource manager are not wired together.** `execute`/`stream`
  do not `acquire` from the `ResourceManager` — concurrency limiting is available
  but the agent loop must call it explicitly around tool calls; the engine does not
  enforce it automatically.
- **`stream` buffers progress.** Progress events are collected into an array and
  yielded *after* the handler completes, not live during execution — so `stream`
  currently gives you ordering, not true incremental delivery.
- Two module-level counters (`executionCounter`) mint ids as
  `` `exec_${Date.now()}_${n}` `` — same process-local caveat as `createToken`.

---

## `vibe/core`

**Purpose.** The composition root. `vibe.system({ name })` wires a container, a
lifecycle, a logger, a plugin host, and a runtime into a single `System` object —
the one thing an application holds. See [Core concepts](../architecture/01-core-concepts.md).

**Key exports.**

- `vibe` — `{ system(config) }`.
- `createSystem(config)` → `System`.
- `System` interface — `name`, `info`, `logger`, `plugins`, `runtime`, plus
  `init()`, `start()`, `stop(timeoutMs?)`, `ask(prompt)`.
- Tokens: `containerToken`, `loggerToken`, `lifecycleToken`, `pluginHostToken`.
- `SystemConfig` (`{ name, logLevel?, plugins? }`), `SystemInfo`.

**Strengths.** The wiring is clean and correct. The container self-registers the
container, logger, lifecycle, and plugin host as tokens, so the future agentic layer
can `resolve()` them. Lifecycle before/after handlers do the right work at the right
time: `start` registers and starts configured plugins; `stop` shuts them down first,
then logs. `start()` composes `init()` then `start()`, giving a one-call bring-up.
`info` reports live state, uptime, and plugin count.

**Gaps / notes.**

- **`ask()` is now implemented (was a deliberate stub).** It runs the real
  `vibe/agent` loop through a configured provider, as documented in the
  [audit](./03-current-state-audit.md#the-headline-api-is-now-implemented-was--unimplemented) —
  the [agentic implementation plan](../plan/02-agentic-implementation-plan.md) has
  landed (Packages 1–6). Everything above exists to make that loop clean and
  hand-writable; what remains is exercising it against the live Anthropic API.
- **The runtime is created but not registered as a token.** `containerToken`,
  `loggerToken`, `lifecycleToken`, `pluginHostToken` are registered;
  the `runtime` is only exposed as a property. The agentic layer will want a
  `runtimeToken` to resolve it by DI like the others.
- `info` is a getter that stamps `Date.now()` on each read (🟡 in the audit) —
  harmless, but don't cache the object expecting a stable `uptimeMs`.
- Configured plugins are registered in `onBefore("start")` in array order — this is
  where the "register dependencies first" contract from `vibe/plugin` bites, since
  the host does not sort them.

---

## Cross-cutting observations

- **Branded types are used consistently** and correctly — `ServiceToken<T>`,
  `ExecutionId`, `TaskId`, `CheckpointId` all flow from the same one-line `Brand`.
- **The error taxonomy is ahead of the code.** `ProviderError`, `ToolError`,
  `ProviderRateLimitError`, `ValidationError` already exist with the right
  `retryable`/`fatal` flags, and `runtime` already consumes `retryable` — the
  agentic layer inherits a correct error model on day one.
- **"Durable" is a design promise, not yet a runtime property.** The runtime's
  persistence, checkpoint-resume, and live streaming are shaped but in-memory. This
  is the single largest gap between the docs' language and the current code, and
  the honest place to set expectations. See [Bottlenecks & trade-offs](./02-bottlenecks-and-tradeoffs.md).
- **Config packages are mid-refactor.** `packages/biome-config` and
  `packages/typescript-config` exist but the move to shared config is uncommitted
  (🔴 in the audit). Not a runtime concern, but it gates the agentic build.
