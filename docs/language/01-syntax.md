# Vibe Language Syntax

> 🚧 Planned. Every top-level construct in a `.vibe` file, and how it compiles to
> the [`@vibe/*` runtime](../architecture/00-overview.md). The formal grammar is in
> [specs/grammar](../specs/grammar.md).

A `.vibe` file is a sequence of **declarations**. Declarations are Vibe-specific
(`agent`, `tool`, `model`, `memory`, `plugin`, `config`); everything *inside* a
`tool` body, every type, and every `import` is ordinary TypeScript.

## File shape

```vibe
import { db } from "./db"            // TS interop (see 04-typescript-interop)

config { … }                          // at most one per project (usually in vibe.config or a root .vibe)
model  … ; memory … ; tool …          // reusable declarations
agent  … ; plugin …                   // wiring
```

Order is not significant — the compiler resolves references across the whole
compilation, so an `agent` may `use` a `tool` declared later.

---

## `tool`

A tool is a typed function the model can call. **One declaration** yields the
handler *and* the model-facing JSON Schema (from the parameter types) — no
duplication.

```vibe
tool GetOrder(orderId: string) -> OrderStatus {
  const order = await db.orders.find(orderId)
  return order ?? { status: "not_found" }
}
```

- **Parameters** use TypeScript types; they become the tool's input schema.
- **`-> ReturnType`** is optional (inferred if omitted) and typed by TypeScript.
- **The body** is a TypeScript block. `await` is allowed (handlers are async).
- **`ctx`** (cancellation token, logger bound to the run's trace id, signal) is
  available as an implicit binding, or named explicitly: `tool T(...) with ctx {…}`.
- A doc comment above the tool becomes its `description` (what the model sees):

```vibe
/// Look up the current status of a customer order by id.
tool GetOrder(orderId: string) -> OrderStatus { … }
```

**Compiles to** a `defineTool({ name, description, schema, execute })` call — see
[Tools & MCP](../architecture/11-tools-and-mcp.md) and [Tool spec](../specs/tool-spec.md).
A thrown body becomes a `tool_result` with `isError: true` returned to the model,
exactly as in the runtime.

### Parameter descriptions

Annotate a parameter so the model gets guidance:

```vibe
tool GetOrder(
  orderId: string @desc("The order id, e.g. '1024'.")
) -> OrderStatus { … }
```

---

## `agent`

An agent binds a model, a system prompt, tools, and (optionally) memory and
sub-agents. Its block is a set of **fields** and **wiring statements**.

```vibe
agent Support {
  model   claude-opus-4-8         // catalog id (completed by the LSP)
  effort  high                    // low | medium | high | xhigh | max
  system  "You are a concise support agent. Use tools before guessing."
  memory  conversation            // or a named memory declaration

  use GetOrder                    // wire in a tool
  use RefundOrder
  use Escalation                  // wiring a sub-agent works the same way
}
```

Fields:

| Field | Type | Notes |
|---|---|---|
| `model` | model id or `model` ref | Default `claude-opus-4-8`. |
| `effort` | keyword | Maps to `output_config.effort`. |
| `system` | string / triple-quoted block | The system prompt. |
| `memory` | `conversation` \| memory ref | See `memory` below. |
| `maxIterations` | number | Loop ceiling (default 10). |
| `use` | statement | Wire a `tool`, `agent` (sub-agent), or `plugin`. |

**Compiles to** `createAgent({ model, system, tools, memory, … })`. `use X`
resolves `X` to a tool/sub-agent and adds it to the agent's tool set. See
[The agent loop](../architecture/09-agent-loop.md) and [Agent spec](../specs/agent-spec.md).

### Triple-quoted prompts

Long prompts use `"""…"""`, with `${…}` interpolation of in-scope TypeScript
values:

```vibe
agent Support {
  model claude-opus-4-8
  system """
    You are a support agent for ${company.name}.
    Today is ${today()}. Always use tools before guessing.
  """
}
```

---

## `model`

Name and reuse a model configuration:

```vibe
model Fast {
  id      claude-haiku-4-5
  effort  low
}

agent Triage {
  model Fast           // reference the named model
  use   Classify
}
```

**Compiles to** a model config object passed to the provider. Defaults and the
catalog are in [Model spec](../specs/model-spec.md). The provider itself
(Anthropic, keys) is configured in `config`/`provider`, not inline.

---

## `memory`

Declare a memory backend and attach it to agents:

```vibe
memory Support {
  kind        conversation      // conversation | store
  budget      120_000           // token budget for the request builder
}

agent Support { model claude-opus-4-8 ; memory Support }
```

`memory conversation` inline is shorthand for an ephemeral per-run conversation.
**Compiles to** the [`@vibe/memory`](../architecture/12-memory-and-context.md)
constructs.

---

## `plugin`

Declare or wire a plugin (hooks around lifecycle/agent events):

```vibe
plugin Metrics {
  on start   { console.log("[metrics] up") }     // TS body
  on stop    { await flush() }
}

agent Support { … ; use Metrics }
```

Plugins may also be authored in TypeScript and imported — `import { metrics } from "./metrics"` then `use metrics`. **Compiles to** the
[plugin host](../architecture/06-plugin-system.md) API.

---

## `config`

Project configuration as a language construct (the alternative to a
`vibe.config.ts` file — both are supported; see
[Configuration & bootstrap](../architecture/14-configuration-and-bootstrap.md)).

```vibe
config {
  name      "support-bot"
  logLevel  info
  provider  anthropic          // reads ANTHROPIC_API_KEY from env
  runtime {
    limits { http: 8 ; db: 4 } // named ResourceManager concurrency limits
  }
}
```

**Compiles to** the resolved `VibeConfig` that bootstraps the system.

---

## `import` (TypeScript interop)

Ordinary TS imports bring your code and types into scope for tool bodies, prompt
interpolation, and plugin bodies:

```vibe
import { db } from "./db"
import type { OrderStatus } from "./types"
```

`.vibe` files can also be imported *from* TypeScript (the compiler emits `.d.ts`).
Full rules in [TypeScript interop](./04-typescript-interop.md).

---

## Lexical details

- **Comments:** `// line`, `/* block */`; `/// doc` attaches a description to the
  next declaration.
- **Identifiers & types:** TypeScript rules.
- **Keywords:** `agent`, `tool`, `model`, `memory`, `plugin`, `config`, `use`,
  `on`, `with`, `import`, `export`. Keywords are contextual where possible so they
  don't collide with your identifiers inside TS bodies.
- **Strings:** `"…"` and triple-quoted `"""…"""` with `${…}` interpolation.
- **Numbers:** TypeScript numeric literals (`120_000` allowed).
- **`export`:** prefix a `tool`/`agent`/`model` to make it importable from other
  `.vibe`/`.ts` files (`export tool GetOrder(...)`).

## Worked example

```vibe
// support.vibe
import { db } from "./db"
import type { OrderStatus } from "./types"

config {
  name "support-bot"
  logLevel info
  provider anthropic
}

model Fast { id claude-haiku-4-5 ; effort low }

/// Look up the current status of a customer order by id.
export tool GetOrder(orderId: string @desc("Order id, e.g. '1024'")) -> OrderStatus {
  const order = await db.orders.find(orderId)
  return order ?? { status: "not_found" }
}

agent Triage {
  model Fast
  system "Classify the request and route it."
  use GetOrder
}

agent Support {
  model  claude-opus-4-8
  effort high
  system """
    You are a concise support agent. Use tools before guessing.
  """
  use GetOrder
  use Triage        // Support may delegate to Triage as a sub-agent
}
```

`vibe dev` compiles this to TypeScript, wires it onto the runtime, and runs the
default/entry agent. See [The compiler](./02-compiler.md) for what it emits.
