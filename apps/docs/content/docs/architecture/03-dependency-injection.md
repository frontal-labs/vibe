---
title: "Dependency Injection — `vibe/di`"
description: "`vibe/di` is a small, explicit, type-safe container. There is no decorator magic,"
---

# Dependency Injection — `vibe/di`

`vibe/di` is a small, explicit, type-safe container. There is no decorator magic,
no reflection, no metadata. Services are keyed by **branded tokens** that carry
their own value type, so `resolve(token)` returns the right type with no cast. This
is the seam that makes the agentic layer testable: the loop resolves a
`ModelProvider` by token, and a test registers a fake against the same token.

## Tokens: `createToken` and `ServiceToken<T>`

A token is a branded string that remembers what it points at:

```ts
export type ServiceToken<T> = Brand<string, `ServiceToken`> & {
  readonly __type: T
}

let counter = 0

export function createToken<T>(name: string): ServiceToken<T> {
  counter++
  return `${name}__${counter}` as ServiceToken<T>
}
```

Two things are happening:

- **Branding.** `ServiceToken<T>` is a `Brand<string, "ServiceToken">` (from
  [`vibe/shared`](./02-package-topology.md)) intersected with a phantom
  `__type: T`. At runtime it is just a string; at compile time the `T` rides along
  so the container can return `T` from `resolve`. You cannot pass a plain string
  where a `ServiceToken<T>` is expected.
- **Uniqueness by suffix.** The returned string is `` `${name}__${counter}` ``, so
  two `createToken("logger")` calls yield distinct keys (`logger__1`,
  `logger__2`). This prevents accidental collisions between two tokens that happen
  to share a human-readable name.

### ⚠️ Caveat: the counter is module-local

`counter` is a **module-level variable**, incremented once per `createToken` call
in the process. Uniqueness is therefore *process-local*, not global:

- Tokens are **not stable across processes or restarts** — `logger__2` in one run
  may be `logger__5` in another. Never serialize a token or persist it as a
  durable key.
- Tokens are **not portable across module-graph duplication** — if `vibe/di` were
  loaded twice (duplicate installs, some bundler edge cases), each copy has its own
  `counter` and its own token identity. Mint tokens once and share the reference.

The rule that falls out: **create each token exactly once, at module scope, and
export it.** That is exactly what `core` does (below).

## The container

`createContainer(parent?)` returns a `Container`:

```ts
export interface Container {
  register<T>(token: ServiceToken<T>, factory: Factory<T>, scope?: ServiceScope): void
  registerInstance<T>(token: ServiceToken<T>, instance: T): void
  resolve<T>(token: ServiceToken<T>): T
  isRegistered<T>(token: ServiceToken<T>): boolean
  createScope(): Container
  dispose(): void
}
```

### `register(token, factory, scope?)`

Registers a lazy `Factory<T> = (container: Container) => T`. The factory receives
the container so it can resolve its own dependencies. `scope` defaults to
`"singleton"`; the three scopes are:

| Scope | Behavior |
|---|---|
| `"singleton"` (default) | Factory runs once; the instance is cached for the container's lifetime. |
| `"scoped"` | One instance per scope (child container from `createScope()`); cached in that scope. |
| `"transient"` | Factory runs on **every** `resolve` — no caching. |

Registering the same token twice throws `diResolutionFailed` (a `DiResolutionError`,
code `VIBE_DI_RESOLUTION_FAILED`): registration is not idempotent, and re-binding a
token is treated as a mistake.

### `registerInstance(token, instance)`

The eager path — you already have the value. It stores the instance directly (as a
pre-seeded singleton). This is what `core` uses for the already-constructed system
services.

### `resolve(token)`

Returns `T`, or walks up to the `parent` container if the token isn't registered
locally, or throws `diResolutionFailed` (`No registration found for token "…"`) if
no ancestor has it. Resolution guards against cycles: a token that is resolved
while already mid-resolution throws `diCircularDependency` (a
`DiCircularDependencyError`, code `VIBE_DI_CIRCULAR_DEPENDENCY`) — factories that
depend on each other in a loop fail loudly instead of overflowing the stack.

### `createScope()` and `dispose()`

`createScope()` returns a child container whose `parent` is the current one:
`resolve` misses fall through to the parent, and `"scoped"` registrations get
per-scope instances. `dispose()` clears all registrations, singletons, scoped
instances, and in-flight resolution state.

## How `core` registers system services

`createSystem` mints four tokens **once at module scope** and pre-seeds the
container with `registerInstance` (from `packages/core/src/system.ts`):

```ts
export const containerToken  = createToken("system.container")
export const loggerToken     = createToken<Logger>("system.logger")
export const lifecycleToken  = createToken("system.lifecycle")
export const pluginHostToken = createToken<PluginHost>("system.plugins")

// inside createSystem:
const container = createContainer()
container.registerInstance(containerToken, container)   // the container resolves itself
container.registerInstance(loggerToken, logger)
container.registerInstance(lifecycleToken, lifecycle)
container.registerInstance(pluginHostToken, plugins)
```

Because these tokens are exported module constants, any package can import
`loggerToken` and `resolve` the same `Logger` the system built — no re-wiring, and
tests can swap implementations by registering against the identical token. Note the
container **registers itself** under `containerToken`, so code that only holds a
`Container` can still hand out the root.

This is the pattern the 🚧 agentic layer extends: the model provider is registered
against an exported `modelProviderToken` (see
[Model & provider layer](./10-model-provider-layer.md#registration--di)), the tool
registry and memory likewise, and the agent loop resolves each by token. Swapping a
real provider for a deterministic fake in a test is one `registerInstance` call.

## Why explicit tokens, not classes

- **No runtime reflection.** Works under any bundler, no `reflect-metadata`, no
  `emitDecoratorMetadata`.
- **Type-carrying keys.** `resolve(loggerToken)` is `Logger`, checked at compile
  time — the brand makes a mismatched token a type error, not a `null` at runtime.
- **Interface-first.** Tokens key *interfaces* (`ServiceToken<ModelProvider>`), so
  the loop never names a concrete class — the core of provider-agnosticism.

See [Package topology](./02-package-topology.md) for where `di` sits, and
[Core concepts](./01-core-concepts.md#container--servicetoken-exists) for the
one-paragraph version.
