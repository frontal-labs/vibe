# API Design

Vibe's public surface is small on purpose, and its internals are swappable on
purpose. This page documents the conventions that make both true, grounded in the
real `vibe/core`, `vibe/di`, and `vibe/lifecycle` APIs that exist today.

The governing rule: **the public API is a handful of factory functions and readonly
interfaces; the flexibility lives behind DI tokens.** You compose objects, you
don't subclass framework internals.

## Factory functions over `new`

Vibe hands you factory functions, not classes to instantiate with `new`. Every
constructor in the codebase is a `createX` (or the top-level `vibe.system`):

```ts
export function createSystem(config: SystemConfig): System { /* … */ }
export function createContainer(): Container { /* … */ }
export function createLifecycle(): Lifecycle { /* … */ }
export function createLogger(opts): Logger { /* … */ }
export function createToken<T>(name: string): ServiceToken<T> { /* … */ }
```

Why factories:

- **The return type is an interface, not a class.** Callers depend on `System`, not
  on the closure that implements it. The implementation in
  [`system.ts`](../../packages/core/src/system.ts) is a plain object literal
  returned from a closure — there is no `class System` to extend, and nothing to
  extend it *to*.
- **No inheritance to reason about.** No protected members, no super-call ordering,
  no "which override ran." Behaviour is composed from other factories' outputs
  (`createSystem` calls `createContainer`, `createLifecycle`, `createLogger`,
  `createPluginHost`, `createRuntime`).
- **Trivial to fake.** A test double is any object satisfying the interface; you
  never mock a class.

The one blessed entry point is `vibe.system`, which is a thin, discoverable alias
over `createSystem`:

```ts
export const vibe: Vibe = {
  system(config: SystemConfig): System { return createSystem(config) },
}
```

`vibe.*` is the "front door" namespace; `createX` is the direct import for advanced
use. Both exist, both are public.

## Options objects, not positional arguments

Anything with more than one meaningful parameter takes a single **options object**
with named, mostly-optional fields:

```ts
interface SystemConfig {
  name: string
  logLevel?: LogLevel
  plugins?: Plugin[]
}

vibe.system({ name: "support-bot", logLevel: LogLevel.Debug })
```

This keeps call sites self-documenting, makes optional fields genuinely optional
(one required field, `name`), and lets the surface grow without breaking callers —
the [agentic plan](../plan/02-agentic-implementation-plan.md) extends `SystemConfig`
with model/provider options and an initial tool set, and existing calls keep
compiling. The same convention holds for the planned `defineTool({ … })` 🚧,
`createAgent({ model, system, tools, memory })` 🚧, and `RunOptions` 🚧.

## Branded tokens for identity, not strings

Services are registered and resolved by **branded `ServiceToken<T>`**, never by a
bare string key. A token carries the value type it stands for:

```ts
export type ServiceToken<T> = Brand<string, `ServiceToken`> & { readonly __type: T }

export function createToken<T>(name: string): ServiceToken<T> { /* … */ }
```

The container's signatures thread that type through, so registration and resolution
are checked against each other:

```ts
interface Container {
  register<T>(token: ServiceToken<T>, factory: Factory<T>, scope?: ServiceScope): void
  registerInstance<T>(token: ServiceToken<T>, instance: T): void
  resolve<T>(token: ServiceToken<T>): T
  isRegistered<T>(token: ServiceToken<T>): boolean
}
```

`resolve(loggerToken)` returns a `Logger` with no cast; `resolve(runtimeToken)`
returns a `Runtime`. The System registers itself and its collaborators against
tokens at construction:

```ts
export const loggerToken = createToken<Logger>("system.logger")
export const pluginHostToken = createToken<PluginHost>("system.plugins")
// …
container.registerInstance(loggerToken, logger)
container.registerInstance(pluginHostToken, plugins)
```

The [model layer](../architecture/10-model-provider-layer.md#registration--di)
follows the same pattern: `modelProviderToken = createToken<ModelProvider>("model.provider")`
🚧. This is exactly the seam that keeps the public surface small — see
[the last section](#a-small-public-surface-over-swappable-internals).

## Readonly interfaces

Public interfaces expose state as `readonly` and mutate only through methods. The
`System` interface is the template:

```ts
export interface System {
  readonly name: string
  readonly info: SystemInfo
  readonly logger: Logger
  readonly plugins: PluginHost
  readonly runtime: Runtime
  init(): Promise<void>
  start(): Promise<void>
  stop(timeoutMs?: number): Promise<void>
  ask(prompt: string): Promise<string>
}
```

You cannot reassign `system.logger`; you *can* call `system.start()`. In the
implementation these readonly fields are `get` accessors over closure state, so
`system.info` recomputes (`state`, `uptimeMs`, `pluginCount`) on every read while
staying immutable to the caller. The planned `AgentResult` 🚧 is entirely
`readonly` for the same reason: a result is a value, not a handle.

## Async lifecycle, idempotent transitions

Anything with resources exposes an **async lifecycle**, and its transitions are
**idempotent**. `Lifecycle` is a typed state machine over a fixed set of states:

```ts
export const LIFECYCLE_STATES = [
  "created", "initializing", "ready", "stopping", "stopped", "errored",
] as const
export type LifecycleState = (typeof LIFECYCLE_STATES)[number]
export type LifecycleEvent = "init" | "start" | "stop"
```

Calling `start()` when already `ready` is a no-op; `stop()` when `stopped` is a
no-op. This means orchestration code doesn't have to track "did I already start
this" — it just asserts the state it wants. `System.start()` is deliberately safe to
call redundantly:

```ts
async start() {
  await lifecycle.init()   // no-op if already initialized
  await lifecycle.start()  // no-op if already ready
}
```

Plugins attach `onBefore`/`onAfter` handlers around `init`/`start`/`stop` events;
the model provider and MCP connections warm up on `start` and tear down in reverse
on `stop`. See [Lifecycle](../architecture/04-lifecycle.md).

## Naming conventions

| Kind | Convention | Example |
|---|---|---|
| Constructor | `createX` (or `vibe.x`) | `createSystem`, `createToken`, `vibe.system` |
| Definer / builder | `defineX` | `defineTool` 🚧 |
| Interface | Noun, no `I` prefix | `System`, `Container`, `ModelProvider` |
| Token | `xToken` | `loggerToken`, `modelProviderToken` 🚧 |
| Lifecycle verbs | `init` / `start` / `stop` | `system.stop(timeoutMs?)` |
| Error factory | lowerCamel of the type | `notImplementedError`, `timeoutError` |
| Error type | `XError` | `TimeoutError`, `ProviderRateLimitError` |
| Event tags | `namespace:verb` | `model:start`, `tool:result` 🚧 |

Verbs are consistent across the stack: you `start` a system, a lifecycle, a plugin
host; you `execute` a runtime task; you `run` an agent 🚧; you `resolve` a token.

## A small public surface over swappable internals

The two previous facts — factories returning interfaces, and DI resolution by
branded token — combine into Vibe's core design move: **the public surface stays
tiny while every internal is swappable.**

- The **public surface** an app touches is basically `vibe.system(config)` and the
  `System` interface. That's the whole "getting started" API.
- The **internals** — logger, lifecycle, plugin host, runtime, and (planned) model
  provider, tool registry, memory — are all registered against `ServiceToken<T>`s
  and resolved by the layers that need them.

Because the agent loop resolves its `ModelProvider` *by token* rather than importing
a vendor SDK, swapping providers is a registration change, not a rewrite:

```ts
// production
container.registerInstance(modelProviderToken, createAnthropicProvider({ apiKey })) // 🚧
// tests — deterministic, no network
container.registerInstance(modelProviderToken, createFakeProvider(script))          // 🚧
```

The loop's code is identical in both cases. This is why Vibe can promise
"provider-agnostic core, Claude-first defaults" without a plugin-driven abstraction
tax: the abstraction is one interface behind one token. See
[Model & provider layer](../architecture/10-model-provider-layer.md) and
[Dependency injection](../architecture/03-dependency-injection.md).

## Where to go next

- [Type safety](./02-type-safety.md) — how these interfaces catch mistakes at
  compile time.
- [Developer experience](./00-developer-experience.md) — the principles these
  conventions serve.
