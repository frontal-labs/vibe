# Lifecycle — `vibe/lifecycle`

Every long-lived thing in Vibe — the system, and later providers, MCP connections,
and tool resources — moves through the same small state machine. `vibe/lifecycle`
is that machine: a typed set of states, a transition table, ordered before/after
handlers, and **idempotent** transitions so `start()`/`stop()` are safe to call
more than once.

## States

```ts
export const LIFECYCLE_STATES = [
  "created",
  "initializing",
  "ready",
  "stopping",
  "stopped",
  "errored",
] as const

export type LifecycleState = (typeof LIFECYCLE_STATES)[number]
export type LifecycleEvent = "init" | "start" | "stop"
```

The happy path is `created → initializing → ready → stopping → stopped`, with
`errored` as the terminal failure state. Three events drive it: `init`, `start`,
`stop`.

```
        init            start              stop
created ─────▶ initializing ─────▶ ready ─────▶ stopping ─────▶ stopped
   │                                                               ▲
   └──────────────────── stop (created → stopped) ─────────────────┘

  any state ──(stop times out / error)──▶ errored   (terminal)
```

## The transition table

`transitionState(current, event)` is a total function — every (event, state) pair
maps to a next state. When the next state equals the current one, nothing changes
(that is how idempotency and no-op events are encoded):

| current \ event | `init` | `start` | `stop` |
|---|---|---|---|
| `created` | `initializing` | `ready` | `stopped` |
| `initializing` | `initializing` | `ready` | `stopping` |
| `ready` | `ready` | `ready` | `stopping` |
| `stopping` | `stopping` | `stopping` | `stopping` |
| `stopped` | `stopped` | `stopped` | `stopped` |
| `errored` | `errored` | `errored` | `errored` |

Note `start` from `created` jumps straight to `ready` (init is folded in), and
`stop` from `created` goes straight to `stopped` (nothing to tear down).

## Validity and idempotency

`transitionState` tells you *where* you'd go; `isValidTransition` tells you whether
the event is *allowed* from here:

```ts
export function isValidTransition(current: LifecycleState, event: LifecycleEvent): boolean {
  const next = TRANSITIONS[event][current]
  if (next !== current) return true
  // Idempotent: calling start when already ready, or stop when already stopped
  return (event === "start" && current === "ready") || (event === "stop" && current === "stopped")
}
```

A transition is valid if it moves you somewhere new, **or** if it's one of the two
explicitly-idempotent no-ops:

- **`start` when already `ready` → no-op.** Starting a running system is safe.
- **`stop` when already `stopped` → no-op.** Stopping a stopped system is safe.

Any other self-loop (e.g. `start` from `errored`, or `init` from `stopping`) is
**invalid** and throws `lifecycleError` (a `LifecycleError`, code
`VIBE_LIFECYCLE_INVALID_TRANSITION` — see [Errors](./07-errors.md)):

```
Cannot start from state "errored"
```

This is the "at most once, in order" guarantee the [overview](./00-overview.md#how-the-foundations-serve-the-agent-loop)
promises: providers and resources initialize and stop exactly once, and duplicate
calls are absorbed rather than corrupting state.

## Handlers: `onBefore` / `onAfter`

```ts
export interface Lifecycle {
  readonly state: LifecycleState
  onBefore(event: LifecycleEvent, handler: LifecycleHandler, options?: { priority?: number }): void
  onAfter(event: LifecycleEvent, handler: LifecycleHandler): void
  init(): Promise<void>
  start(): Promise<void>
  stop(timeoutMs?: number): Promise<void>
}

export type LifecycleHandler = () => void | Promise<void>
```

`createLifecycle(initialState = "created")` returns a `Lifecycle`. You attach
async work around events:

- **`onBefore(event, handler, { priority })`** — runs *before* the state changes.
  Handlers are sorted by **descending priority** (default `0`), so higher-priority
  setup runs first. This is where you bring resources up.
- **`onAfter(event, handler)`** — runs *after* the state has changed, in
  registration order (no priority). This is where you announce/confirm.

Each event executes as: run all `before` handlers (awaited, in order) → flip the
state → run all `after` handlers (awaited). If the transition is a no-op (state
wouldn't change), **handlers are skipped entirely** — idempotent calls do no work.

### Stop: auto-complete and timeout

`stop(timeoutMs?)` has two behaviors worth calling out:

1. **Auto-complete.** `stop` transitions `ready`/`initializing` to `stopping`, runs
   the handlers, then automatically advances `stopping → stopped`. Callers get a
   clean `stopped` state without a second call.
2. **Timeout → errored.** `stop` races the shutdown against a timer (default
   **30 000 ms**). If shutdown overruns, it rejects with `lifecycleError`
   (`Shutdown timed out after …ms`) and forces the state to `errored`. A hung
   shutdown never leaves the system wedged in `stopping` forever.

## How `core` wires plugins into the lifecycle

`createSystem` (in `packages/core/src/system.ts`) is the reference consumer. It
registers handlers that thread the [plugin host](./06-plugin-system.md) and
[logger](./08-logging-observability.md) through the machine:

```ts
lifecycle.onBefore("init",  async () => logger.debug("System initializing", …))
lifecycle.onAfter("init",   async () => logger.info("System initialized", …))

lifecycle.onBefore("start", async () => {
  logger.info("System starting", …)
  for (const plugin of config.plugins ?? []) await plugins.register(plugin)  // dependency-ordered
  if ((config.plugins ?? []).length > 0) await plugins.startup()             // fire "startup" hook
})
lifecycle.onAfter("start",  async () => logger.info("System started", { uptimeMs: … }))

lifecycle.onBefore("stop",  async () => {
  logger.info("System stopping", …)
  await plugins.shutdown()                                                   // fire "shutdown" hook
})
lifecycle.onAfter("stop",   async () => logger.info("System stopped", { uptimeMs: … }))
```

Plugin **startup** runs in `onBefore("start")` (plugins register and start before
the system reports `ready`), and plugin **shutdown** runs in `onBefore("stop")`
(plugins tear down before the system leaves `ready`). The system's public
`start()` calls `lifecycle.init()` then `lifecycle.start()`, so a single
`await system.start()` walks `created → ready`; `stop()` walks it to `stopped`.

Because transitions are idempotent, calling `system.start()` twice is harmless, and
so is a double `stop()` — exactly the property you want when process signals and
error handlers might both trigger shutdown.

🚧 In the agentic layer, model providers, MCP connections, and tool resources
attach their own `onBefore`/`onAfter` handlers here (warm-up on `init`/`start`,
teardown on `stop`), so provider connections open and close in order, once — see
[Model & provider layer](./10-model-provider-layer.md#lifecycle--runtime-integration).
