# Enterprise capabilities

Vibe ships a set of packages that make it production-ready for complex enterprise
workflows: OpenAI-API compatibility, durable workflows, skills, an ontology layer,
and the governance / security / observability cross-cuts. Every piece builds on the
existing primitives (the `ModelProvider`, Standard-Schema tools, the streaming agent
loop, the runtime execution engine, the plugin hooks, tracing, and logging) rather
than introducing parallel machinery.

Import from the `vibe/*` barrel or the underlying `@vibe/*` packages directly.

## OpenAI-API compatibility (`@vibe/model`, `@vibe/adapters`)

Both directions are supported.

**Consume any OpenAI-compatible backend** as a `ModelProvider`:

```ts
import { createOpenAIProvider } from "vibe/model"

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://api.openai.com/v1", // or Azure / vLLM / Ollama / together
})
```

It maps `ModelRequest` → Chat Completions (tools, `tool_choice`, streaming) and
normalizes responses/SSE back into Vibe's `ContentBlock`/`ModelStreamEvent` shapes,
reusing the same retry path as the Anthropic provider.

**Expose a Vibe agent behind the OpenAI API** so existing OpenAI clients can call it:

```ts
import { toOpenAICompatHandler } from "vibe/adapters"

const handler = toOpenAICompatHandler(agent) // POST /v1/chat/completions + GET /v1/models
```

Streaming emits `chat.completion.chunk` events ending in `data: [DONE]`; non-streaming
returns a spec-shaped `chat.completion` with `usage`.

## Workflows (`@vibe/workflows`)

Durable, code-first, typed step graphs built on the runtime execution engine.
Steps run sequentially (each output feeds the next); `parallel`, `conditional`, and
`mapOver` express fan-out and branching. Every step checkpoints — passing the same
`runId` + checkpoint store **resumes** a failed run, skipping completed steps. A
shared cancellation token stops the whole tree, and an optional tracer nests
`workflow → step → agent` spans.

```ts
import { defineWorkflow, runWorkflow, step, parallel } from "vibe/workflows"

const wf = defineWorkflow({
  name: "support",
  steps: [
    step("triage", (input, ctx) => classify(input)),
    parallel("gather", [step("kb", ...), step("history", ...)]),
    step("answer", (gathered, ctx) => agent.run({ text: summarize(gathered) })),
  ],
})

const result = await runWorkflow(wf, { runId: "req-42", input: userMessage, store })
```

## Skills (`@vibe/skills`)

One registry for two authoring styles:

- **Code skills** (`defineSkill`) — typed, executable tools with discovery metadata.
- **Markdown procedures** (`skills/*.md`, `loadMarkdownSkill`) — playbooks with
  frontmatter whose body is injected on demand (progressive disclosure).

Both are `Tool`s, so they run through `runToolCall` and drop straight into
`createAgent({ tools })`.

## Ontology (`@vibe/ontology`)

Two layers:

- **Entity/type registry** — `defineEntity(name, schema, { version })` over Standard
  Schema, versioned and addressable, the canonical typed contract for tool/skill/step
  I/O.
- **Semantic store** — `createInMemoryOntologyStore()` with upsert / relate / retrieve
  (a reference hashing embedder + relation graph). Expose `createRetrieveTool(store)`
  so an agent can pull grounding context mid-loop, or `retrieveContext()` to inject it
  into a prompt. The `OntologyStore` interface is pluggable (pgvector, a graph DB, a
  hosted embedding model).

## Governance (`@vibe/governance`)

A policy engine evaluated before a tool runs — `allow` / `deny` / `require-approval`,
strictest-wins. `guardTool(tool, engine)` wraps a tool so a denied/unapproved call
returns an error result instead of executing (it never forks the agent loop). The
`ApprovalGate` suspends a call until a human resolves it — pair it with workflow
checkpoints for human-in-the-loop.

## Security (`@vibe/security`)

- **Secrets** — a `SecretsProvider` interface (env / in-memory built in; back it with
  Vault/AWS/etc.).
- **PII** — `redactPII` / `createPIIRedactor` for emails, phones, cards, SSNs, IPs.
- **Guardrails** — `createContentGuard` flags prompt-injection patterns and blocked
  terms in tool I/O and user text.
- **Rate limiting** — `createRateLimiter` for per-tenant/per-actor fixed-window limits
  (complements the runtime `ResourceManager`'s concurrency caps).

## Observability (`@vibe/observability`)

- **Metrics** — counters + histograms (`createMetrics`) for tokens, latency, errors.
- **Audit** — an append-only `AuditLog` with correlation ids and a pluggable sink.
- **Cost** — `costOf(usage, model)` prices a run from the model catalog.
- **OTLP** — `createOTLPExporter` converts tracer spans to OTLP for any collector; it
  is structurally a `@vibe/tracing` `SpanExporter`.

## Configuration

`VibeConfig` (`vibe.config.ts`) gained `skills`, `workflows`, `ontology`,
`governance`, `security`, and `observability` sections, and `discoverApp` scans
`skills/` (code + `.md`) and `workflows/` alongside `agents/` and `tools/`.

## End-to-end

See `tests/integration/enterprise.test.ts` for a worked example: a durable workflow
whose steps ground a response from the ontology, run a governance-guarded tool,
redact PII, and record metrics + an audit trail — plus the agent served behind
`/v1/chat/completions`.
