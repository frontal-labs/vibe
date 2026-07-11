# Memory & Context

> 🚧 Planned — package `@vibe/memory`. The message history and request assembly the
> [agent loop](./09-agent-loop.md) runs over, built on `shared`'s
> [`ContextStore`](../../packages/shared/src/context-store.ts).

Two different things wear the word "memory," and Vibe keeps them separate:

- **Conversation** — the ordered message history of **one run**. Append-only, cheap,
  ephemeral. This is what the loop reads and writes every iteration.
- **Memory** — optional **cross-run** persistence. A key/value store an agent reads
  from and writes to, surviving beyond a single `run()`. Pluggable backend;
  in-memory by default.

The [request builder](#the-request-builder) sits between them and the
[model layer](./10-model-provider-layer.md): it assembles `system + messages + tools`
into a `ModelRequest` that fits the token budget and is friendly to the provider's
prompt cache.

## Conversation — append-only run history

A `Conversation` is the transcript for a single run: user turn, assistant turns
(text/thinking/tool-use blocks), and tool results — in order. It is append-only, and
a **snapshot** yields an immutable copy for logging, replay, or handing to a
sub-agent.

```ts
import type { Message, ContentBlock } from "@vibe/model"

interface Conversation {
  appendUser(text: string): void
  appendAssistant(content: ContentBlock[]): void
  appendToolResults(results: ToolResult[]): void   // ONE message, all results
  messages(): readonly Message[]                    // live view for the request builder
  snapshot(): Message[]                             // immutable copy for the transcript
  readonly length: number
}

type Message =
  | { role: "user"; content: string | ContentBlock[] }
  | { role: "assistant"; content: ContentBlock[] }
  | { role: "tool"; content: ToolResult[] }         // parallel results in one message
```

The `appendToolResults` shape enforces the loop's rule that **all** parallel
`tool_result` blocks land in a single message — see
[Tools & MCP](./11-tools-and-mcp.md#parallel-execution--one-results-message).

### Built on the context-store

`Conversation` uses `shared`'s [`ContextStore`](../../packages/shared/src/context-store.ts)
(an `AsyncLocalStorage` wrapper) to make the *current* conversation ambient within a
run. Tools, hooks, and sub-agent spawns inside `run()` can resolve "the conversation
I'm part of" without threading it through every signature:

```ts
const conversationStore = new ContextStore<Conversation>()

// The loop establishes the ambient conversation for the whole run:
return conversationStore.run(conversation, async () => {
  // ...the entire agent loop executes here; ctx-aware code can read it...
  return runLoop()
})

// Anywhere inside the run:
const convo = conversationStore.get()   // the active conversation, or undefined
```

The message list itself is a plain append-only array — `ContextStore` scopes
*visibility* (which conversation is "current"), not storage. Snapshots are structural
copies, so a snapshot handed to a sub-agent can't be mutated by the parent.

## Memory — cross-run, pluggable

`Memory` is the durable layer: facts, summaries, or artifacts an agent wants across
runs. The interface is deliberately tiny — `get` / `set` / `append` — so backends
stay simple and swappable.

```ts
interface Memory {
  get<T = unknown>(key: string): Promise<T | undefined>
  set<T = unknown>(key: string, value: T): Promise<void>
  append(key: string, entry: unknown): Promise<void>   // for growing logs/notes
  delete(key: string): Promise<void>
}
```

- **Default backend** is in-memory (a `Map`), scoped to the system's lifetime — zero
  setup, correct for tests and single-process apps.
- **Pluggable backends** implement the same interface over Redis, SQLite, a vector
  store, etc. A backend is registered against a DI token, exactly like the
  [model provider](./10-model-provider-layer.md#registration--di), so swapping it
  never touches the loop.

```ts
export const memoryToken = createToken<Memory>("memory")
container.registerInstance(memoryToken, createInMemoryMemory())   // default
```

### Conversation vs Memory at a glance

| | Conversation | Memory |
|---|---|---|
| Scope | One `run()` | Across runs |
| Shape | Ordered messages | Key/value + append |
| Lifetime | Ephemeral (snapshot to persist) | Durable (backend-dependent) |
| Written by | The loop, every iteration | The agent/tools, deliberately |
| Feeds the model? | Yes — it *is* the `messages` | Only via the request builder injecting it |
| Backend | context-store array | in-memory default, pluggable |

A common pattern: at the end of a run, the agent writes a distilled summary into
`Memory`; the next run's request builder reads that summary and injects it as
context — so the *conversation* stays short while *memory* carries continuity.

## The request builder

`buildRequest` turns the current conversation, the system prompt, and the tool
schemas into a `ModelRequest`, keeping the whole thing within a token budget.

```ts
interface BuildRequestInput {
  system: string
  conversation: Conversation
  tools: ToolSchema[]                    // from registry.toSchemas() — already sorted
  memory?: Memory
  budget?: TokenBudget                   // input token ceiling for this call
}

interface TokenBudget {
  maxInputTokens: number                 // e.g. leave headroom under the context window
  reserveForOutput: number               // don't fill the window; leave room to answer
}

async function buildRequest(input: BuildRequestInput): Promise<ModelRequest>
```

Its responsibilities, in order:

1. **Assemble** `system`, the sorted `tools`, and `conversation.messages()` into a
   `ModelRequest`.
2. **Measure** with the provider's `countTokens` — never a client-side estimator, and
   never `tiktoken` (that is OpenAI's tokenizer and is wrong for Claude; see the
   [model spec](../specs/model-spec.md#token-usage)).
3. **Fit the budget** when the assembled request exceeds `maxInputTokens`, via the
   hooks below.
4. **Inject** volatile context (timestamps, ids, retrieved memory) *late*, after the
   stable prefix, to protect the prompt cache.

### Compaction & context-editing hooks

As a long run approaches the limit, the builder runs a policy hook rather than
hard-truncating. Two complementary strategies:

```ts
interface ContextPolicy {
  // Summarize the oldest turns into a compact synthetic message.
  compact?(older: Message[], ctx: PolicyContext): Promise<Message>
  // Prune stale/bulky content in place (e.g. drop old tool_result bodies,
  // keep their tool_use call so the trace stays coherent).
  edit?(messages: Message[], ctx: PolicyContext): Promise<Message[]>
}
```

- **Compaction** replaces a window of old turns with a model-written summary. A cheap
  model (`claude-haiku-4-5`) is the natural choice for the summarizer — it is a
  fan-out-style side task, not the main reasoning.
- **Context editing** prunes without summarizing: the most common move is dropping the
  *bodies* of old `tool_result` blocks (a large file read three turns ago) while
  keeping the `tool_use` that produced them, so the conversation stays coherent and
  the cache prefix stays intact for as long as possible.

Both hooks fire only *near the limit* — the default is to change nothing, because
every mutation to the message prefix is a potential cache miss.

## Prompt-cache-friendly assembly

The provider caches on a **prefix**: identical leading bytes across calls are billed
and processed as a cache read. The request builder is designed to maximize that hit
rate. The layout:

```
┌──────────────────────────────┐  ← cache prefix (stable across turns)
│ system   (frozen string)     │     • never inject timestamps/ids here
│ tools    (sorted by name)    │     • deterministic order from registry.toSchemas()
├──────────────────────────────┤  ← cache_control breakpoint
│ messages (append-only)       │     • prior turns are already-cached tail
│   …                          │
│ [volatile context injected   │     • retrieved memory, "now", request ids
│  LATE, near the newest turn] │       go here — after the stable prefix
└──────────────────────────────┘
```

Concretely:

- **Stable system.** The system prompt is frozen for the run. Anything dynamic —
  the current time, a user id — is *not* in `system`; it goes into a late user/context
  message. One changed byte in `system` invalidates the entire cached prefix.
- **Deterministic tool order.** `registry.toSchemas()` sorts by name, so the tool
  block is byte-identical every turn. Never emit tools in registration/iteration
  order.
- **Append-only messages.** Because the conversation only grows, each turn's prefix
  is last turn's cached content plus the new tail — the ideal shape for prefix
  caching. This is exactly why compaction/editing are last resorts: they rewrite the
  prefix and force a re-cache.
- **Late volatile injection.** Retrieved `Memory`, timestamps, and ids are injected
  as late as possible so they never sit in front of otherwise-cacheable content.

These rules are the memory-layer counterpart to the model spec's
[prompt-caching guidance](../specs/model-spec.md#prompt-caching-guidance) — the model
layer sets `cache_control`; the memory layer produces the stable, deterministic
prefix that makes it pay off.

## How it composes with the loop

```
Agent.run
  ├─ conversation.appendUser(input.text)
  ├─ loop iteration:
  │    ├─ buildRequest({ system, conversation, tools, memory, budget })
  │    │      ├─ countTokens(provider)  → fits budget (compact/edit near limit)
  │    │      └─ stable prefix (system + sorted tools) · late volatile context
  │    ├─ provider.generate(request)
  │    ├─ conversation.appendAssistant(response.content)
  │    └─ conversation.appendToolResults(...)   // if tool_use
  └─ (optionally) memory.set("summary", …)  for the next run
```

See [Core concepts](./01-core-concepts.md#memory--conversation--vibememory) for the
noun-level summary, the [agent loop](./09-agent-loop.md) for iteration mechanics, and
the [Model spec](../specs/model-spec.md) for `countTokens` and caching rules.
