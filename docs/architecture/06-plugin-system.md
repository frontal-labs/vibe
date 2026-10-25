# Plugin System — `vibe/plugin`

`vibe/plugin` lets teams extend a Vibe system without forking `core`. A plugin
declares a manifest (name, version, dependencies), gets a `setup(hooks)` call at
registration, and attaches handlers to two kinds of hooks: **lifecycle hooks**
(`onBefore`/`onAfter`, keyed to `LifecycleEvent`) and **named hooks** (`on`, keyed
to an arbitrary string). The `PluginHost` registers plugins in dependency order and
fires `startup`/`shutdown`.

## `Plugin` and `PluginManifest`

```ts
export interface PluginManifest {
  name: string
  version: string
  description: string
  dependencies?: string[]
}

export interface Plugin {
  readonly name: string
  readonly version: string
  readonly manifest: PluginManifest
  setup(hooks: PluginHooks): void | Promise<void>
}
```

A plugin's `dependencies` are the **names** of other plugins it requires. `setup`
receives the shared `PluginHooks` object and wires the plugin's handlers.

## Hooks

```ts
export type HookName = string
export type HookHandler = (...args: unknown[]) => void | Promise<void>

export interface PluginHooks {
  on(name: HookName, handler: HookHandler): void
  onBefore<K extends LifecycleEvent>(name: K, handler: HookHandler): void
  onAfter<K extends LifecycleEvent>(name: K, handler: HookHandler): void
}
```

- **`onBefore(event, handler)` / `onAfter(event, handler)`** — lifecycle hooks.
  `event` is a `LifecycleEvent` (`"init" | "start" | "stop"`), so these are
  type-checked against the [lifecycle](./04-lifecycle.md) machine. Handlers fire
  before/after the corresponding lifecycle transition.
- **`on(name, handler)`** — a named hook. `name` is any string; handlers are
  invoked when the host `execute`s that name.

### ⚠️ Named-hook payloads are untyped

`HookHandler` is `(...args: unknown[]) => …`. Named hooks (`on` + `execute`) pass
their arguments straight through with **no type relationship** between the emit
site and the handler:

```ts
hooks.on("startup", (...args) => { /* args: unknown[] — you must narrow */ })
```

There is no per-hook payload map today, so a handler can't know statically what
`args` it will receive. Narrow defensively (the [guards in `vibe/shared`](./02-package-topology.md)
— `isObject`, `isString` — are the tool for this). This is the seam the agentic
layer will close (below).

## `PluginHooks` internals: `execute` / `executeBefore` / `executeAfter`

`createPluginHooks()` returns the public `PluginHooks` plus three driver methods the
host uses to fire handlers:

```ts
execute(name: HookName, ...args: unknown[]): Promise<void>   // named hooks
executeBefore(event: LifecycleEvent): Promise<void>          // onBefore handlers
executeAfter(event: LifecycleEvent): Promise<void>           // onAfter handlers
```

All three iterate their registered handlers and `await` each **sequentially, in
registration order**. Named-hook handlers carry a `priority` field internally, but
it defaults to `0` and there is no public API to set it — effectively FIFO today.
A missing hook name is a silent no-op, not an error.

## `PluginHost`

```ts
export interface PluginHost {
  register(plugin: Plugin): Promise<void>
  unregister(name: string): Promise<void>
  getPlugin(name: string): Plugin | undefined
  getPlugins(): Plugin[]
  getHooks(): PluginHooks
  startup(): Promise<void>
  shutdown(): Promise<void>
}
```

### `register(plugin)` — dependency ordering

`register` enforces two rules before accepting a plugin:

1. **No duplicates.** Registering a name already present throws
   `pluginConflictError` (a `PluginConflictError`, code `VIBE_PLUGIN_CONFLICT` — see
   [Errors](./07-errors.md)).
2. **Dependencies must already be registered.** Each name in
   `manifest.dependencies` is checked against the registered set; a missing one
   throws `pluginNotFoundError` (`VIBE_PLUGIN_NOT_FOUND`):

   ```
   Plugin "reporter" requires dependency "metrics" which is not registered
   ```

Because dependencies must be present *first*, **you register plugins in dependency
order** — a plugin that depends on `metrics` must be registered after `metrics`. On
success the host stores the plugin and immediately `await`s `plugin.setup(hooks)`,
handing over the shared hooks object so the plugin can attach handlers. `core`
registers `config.plugins` in array order during `onBefore("start")` (see
[Lifecycle → wiring](./04-lifecycle.md#how-core-wires-plugins-into-the-lifecycle)),
so **list plugins in dependency order** in `vibe.system({ plugins: […] })`.

### `startup()` / `shutdown()`

```ts
async function startup()  { await hooks.execute("startup") }
async function shutdown() { await hooks.execute("shutdown") }
```

These simply fire the named hooks `"startup"` and `"shutdown"`. So a plugin that
wants startup work registers `hooks.on("startup", …)` in its `setup`. `core` calls
`plugins.startup()` after registering all plugins (still in `onBefore("start")`)
and `plugins.shutdown()` in `onBefore("stop")`.

`getHooks()` returns a **bound** `PluginHooks` facade (only `on`/`onBefore`/
`onAfter`, not the `execute*` drivers), so consumers can register but not fire
hooks. `unregister(name)` throws `pluginNotFoundError` if the name isn't present.

## A minimal plugin

```ts
const metricsPlugin: Plugin = {
  name: "metrics",
  version: "1.0.0",
  manifest: { name: "metrics", version: "1.0.0", description: "collects counters" },
  setup(hooks) {
    hooks.on("startup",  () => { /* open sink */ })
    hooks.on("shutdown", () => { /* flush + close */ })
    hooks.onAfter("start", () => { /* system is ready */ })
  },
}

await system.plugins.register(metricsPlugin) // or pass via vibe.system({ plugins: [metricsPlugin] })
```

## Agent hooks

The agent loop emits four hooks, and the system delivers them to plugins registered on its plugin host:

| Hook | When | Payload |
|---|---|---|
| `agent:iteration` | before each model round-trip | `{ iteration, conversationId? }` |
| `agent:tool-call` | when the model requests a tool, before governance runs | `{ id, name, input, actor? }` |
| `agent:tool-result` | after the tool finishes or is refused | `{ id, name, content, isError }` |
| `agent:done` | when the run completes | `{ text, iterations, stopReason, usage }` |

Handlers are typed. The payload types are declared on `vibe/plugin`'s `HookPayloadMap`, so
`hooks.on("agent:done", (payload) => …)` gives `payload.text` its real type. A package that emits its
own typed hooks adds them the same way, by declaration merging.

### Stability of hook payloads

Hook names and payload fields are a public contract, because plugins are written against them:

- **Adding** an optional field, or a new hook, is non-breaking.
- **Renaming or removing** a hook name or field, or changing a field's type, is breaking. It requires a
  major version and a deprecation period in which the old field keeps working.

`packages/agent/tests/hardening.test.ts` pins the exact field set of every payload, so an accidental
rename fails the test suite. The typed-handler contract is checked by the type tests in
`packages/core/type-tests/hooks.test-d.ts`.

A handler that throws fails the run that triggered it. That is deliberate: a governance or audit plugin
can stop an operation it guards. Hooks run in registration order, and the loop waits for each one.

See [Core concepts → Plugin & Hooks](./01-core-concepts.md#plugin--hooks-exists)
and [Package topology](./02-package-topology.md) for where `plugin` sits.
