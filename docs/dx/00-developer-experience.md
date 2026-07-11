# Developer Experience

Vibe is an opinionated framework, and its opinions are aimed at one thing: making
the 95% of undifferentiated agent infrastructure disappear so the 5% that is your
actual agent can shine. This page states the DX principles and ties each to a
concrete mechanism you can point at in the code — not a slogan, a seam.

The through-line: **the easy thing is one line, the hard thing is always possible,
and the compiler is on your side the whole way.**

## The principles at a glance

| Principle | The promise | The mechanism |
|---|---|---|
| One-line happy path + escape hatch | `vibe.system({name}).ask("…")` works with zero ceremony; every layer under it is public | `@vibe/core` `vibe.system()` → default agent; DI tokens expose the internals |
| Type inference over configuration | Describe data once, get types everywhere | One Zod schema per tool → handler args *and* JSON Schema 🚧 |
| Errors as typed values | Branch on a code, never parse a string | `VibeError` subclasses with `ErrorCode` |
| Observability built in | Every model/tool call is a structured log line with a trace id | `@vibe/logger` context store threaded through the loop |
| Modular install | Use one package without dragging in the rest | Acyclic `@vibe/*` graph; `shared` depends on nothing |
| Progressive disclosure | Learn one concept at a time, in the order you need it | Layered API: `ask()` → `defineTool` 🚧 → `createAgent` 🚧 → custom provider |

## One-line happy path, always-available escape hatch

The happy path is a single expression:

```ts
import { vibe } from "@vibe/core"

const system = vibe.system({ name: "support-bot" })
await system.start()
const answer = await system.ask("What's the status of order #1024?") // 🚧
```

`ask()` currently throws `notImplementedError` — it is wired in the
[agentic implementation plan](../plan/02-agentic-implementation-plan.md), where it
resolves a **default agent** (the system's model provider, a default prompt, the
registered tool set) and returns `agent.run({ text: prompt }).text`. See
[the agent loop](../architecture/09-agent-loop.md#relationship-to-systemask).

The escape hatch is not a rewrite; it is the *same object* exposing more surface.
`System` already gives you `name`, `info`, `logger`, `plugins`, `runtime`, and the
`init`/`start`/`stop` lifecycle. Everything the default agent uses is resolvable
through the DI container by token, so "I need to control the model" is a
`system.agent({ model })` 🚧 call, not a fork:

```ts
const research = system.agent({          // 🚧 escape hatch: same system, custom agent
  model: "claude-fable-5",
  system: "You are a meticulous research analyst.",
  tools: [searchTool, fetchTool],
})
const result = await research.run({ text: "Summarize the Q3 filings." })
```

No cliff between "hello world" and "production." You climb, you don't jump.

## Type inference over configuration

Configuration you have to keep in sync is a bug waiting to happen. Vibe's stance is
to **describe a thing once and infer the rest**. The canonical example is a tool
🚧: you write one Zod schema, and it simultaneously becomes the model-facing JSON
Schema *and* the static type of your handler's arguments.

```ts
import { defineTool } from "@vibe/tools" // 🚧
import { z } from "zod"

const getWeather = defineTool({
  name: "get_weather",
  description: "Get the current weather for a city.",
  schema: z.object({ city: z.string(), units: z.enum(["c", "f"]).default("c") }),
  // args is inferred: { city: string; units: "c" | "f" } — no cast, no duplicate type
  async execute(args, ctx) {
    return `72°${args.units.toUpperCase()} in ${args.city}`
  },
})
```

There is no second declaration of the argument shape to drift out of sync with the
schema the model sees. Change the Zod schema, the handler's types change, and the
JSON Schema the model receives changes — all in one edit. See
[Type safety](./02-type-safety.md) and the [Tool spec](../specs/tool-spec.md).

## Errors are typed values

Stringly-typed error handling (`if (err.message.includes("rate limit"))`) is
fragile and untestable. In Vibe every failure is a `VibeError` subclass carrying a
machine-readable `ErrorCode`, so retry logic, telemetry, and user messaging can all
branch on the same value:

```ts
import { ProviderRateLimitError, VibeError } from "@vibe/errors"

try {
  await system.ask("…")
} catch (err) {
  if (err instanceof ProviderRateLimitError) scheduleBackoff() // structured branch
  else if (err instanceof VibeError) report(err.code, err.serialize())
  else throw err
}
```

The taxonomy is shared across the whole stack — the agent loop's
[error table](../architecture/09-agent-loop.md#error-taxonomy-in-the-loop) and the
[model spec's HTTP mapping](../specs/model-spec.md#errors-http--vibeerrors) resolve
to these same codes. A `429` is a `RateLimitError`, a `400` is an
`InvalidRequestError`, and the runtime's retry knows which set is retryable without
guessing. See [Errors](../architecture/07-errors.md).

## Observability is built in, not bolted on

You should be able to read a production incident straight from the logs. Vibe's
[logger](../architecture/08-logging-observability.md) carries a context store
(`defaultMeta` like `{ system: name }` plus per-call metadata), and the agent loop
threads a per-run **trace id**, token usage, and per-tool timing through it. The
`System` constructs its logger at creation with the system name already bound:

```ts
const logger = createLogger({
  level: config.logLevel ?? LogLevel.Info,
  defaultMeta: { system: config.name },
})
```

Every iteration of the loop emits `model:start` / `model:end`, each tool call's
name + duration + success, and the final `stopReason` — all correlated by trace id.
No wiring, no `console.log`, no bolt-on APM to make an agent observable.

## Modular install: use one package without the rest

Modularity is enforced by the dependency graph, not by convention. `@vibe/shared`
depends on nothing; `@vibe/core` is the composition root that depends on everything.
The layers between are acyclic and independently installable, so you can take a
single piece to solve a single problem:

```ts
import { retry } from "@vibe/runtime"   // just the durable-execution primitives
import { createContainer } from "@vibe/di" // just the DI container
```

You pay only for what you import. The [package topology](../architecture/02-package-topology.md)
rules make "use `@vibe/runtime` without `@vibe/agent`" a supported path, not an
accident. Foundations (`shared`, `errors`, `di`, `lifecycle`, `logger`) and
orchestration (`plugin`, `runtime`) ship today; the agentic packages layer on top.

## Progressive disclosure

The API is arranged so you learn one concept at a time, in the order you actually
need it:

1. **`vibe.system({ name }).ask("…")`** — you know nothing but the entry point.
2. **`defineTool({ … })`** 🚧 — add a capability; meet Zod-schema inference.
3. **`system.agent({ model, system, tools })`** 🚧 — control the model and prompt.
4. **`RunOptions` / `agent.stream()`** 🚧 — bound iterations, cancel, stream events.
5. **DI tokens + custom `ModelProvider`** — swap the provider, register your own
   services against branded tokens.

Each step is optional and additive. You never have to understand the runtime's
`ResourceManager` or the DI container's scopes to say hello — but they are right
there, documented, when you need to bound tool concurrency or write a deterministic
test. That is the whole design: shallow to start, deep when you ask.

## Where to go next

- [API design](./01-api-design.md) — the conventions behind the surface above.
- [Type safety](./02-type-safety.md) — what the compiler catches, before/after.
- [Quickstart](./03-quickstart.md) — build the four steps above, for real.
