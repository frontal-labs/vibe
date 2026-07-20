# Multi-Agent

> 🚧 Planned — the coordinator/delegate pattern layered on `vibe/agent`. Every
> sub-agent is a plain [Agent](./09-agent-loop.md) running the same loop; delegation
> is just a tool.

Multi-agent in Vibe is not a new runtime. A **coordinator** agent runs the ordinary
[agent loop](./09-agent-loop.md); one of its tools is a **delegate** tool that spawns
a **sub-agent** — itself an ordinary Agent with its own model, prompt, and tools — and
returns that sub-agent's answer as the tool result. The coordinator reasons over the
result and continues. Nothing about the loop changes; delegation is a `tool_use` like
any other.

This keeps the design honest: if you understand the single-agent loop, you already
understand multi-agent. There is no separate scheduler, message bus, or agent-to-agent
protocol to learn.

## The coordinator/delegate pattern

```
Coordinator Agent  (claude-opus-4-8)
  loop iteration
    └─ tool_use: delegate("research", "summarize the Q3 filings")
          │  runToolCall → runtime execution
          ▼
       Sub-agent  (claude-haiku-4-5, own prompt + own tools)
          runs its OWN loop to completion
          returns AgentResult
          ▲
          │  tool_result: { content: result.text }
    └─ coordinator observes the text, plans the next step
```

A sub-agent has **its own** model, system prompt, tool set, and conversation. It is
constructed fresh per delegation, runs its loop to a final answer, and the
`delegate` tool returns `result.text` (not the whole transcript) back into the
coordinator's conversation as a normal `tool_result`.

### The delegate tool

`delegate` is a [`defineTool`](./11-tools-and-mcp.md#definetool--one-schema-two-consumers)
tool like any other — which is why it inherits cancellation, timeout, and (if you
want to bound fan-out) a `ResourceManager` concurrency limit for free.

```ts
import { z } from "zod"
import { defineTool } from "vibe/tools"

function delegateTool(subAgents: Record<string, () => Agent>) {
  return defineTool({
    name: "delegate",
    description:
      "Delegate a self-contained subtask to a specialist sub-agent and get its answer. " +
      "Available agents: " + Object.keys(subAgents).join(", ") + ". " +
      "Use for parallelizable or specialized work; do it yourself for simple steps.",
    schema: z.object({
      agent: z.enum(Object.keys(subAgents) as [string, ...string[]]),
      task: z.string().describe("A complete, self-contained instruction. The sub-agent shares no context."),
    }),
    concurrencyLimit: "subagents",     // bound fan-out breadth
    async execute(args, ctx) {
      const agent = subAgents[args.agent]()
      const result = await agent.run(
        { text: args.task },
        {
          cancellationToken: ctx.cancellationToken,   // parent cancel ⇒ sub-agent cancel
          parentTrace: ctx.trace,                     // nest the sub-run under the parent
        },
      )
      return { content: result.text }                 // just the answer, back to the model
    },
  })
}
```

Because `execute` throws-to-`isError` like any tool, a sub-agent that fails (hits its
iteration ceiling, refuses, errors out) returns an `isError` result the coordinator can
react to — it does **not** crash the parent run. Cancellation, however, propagates: the
`cancellationToken` is passed through, so cancelling the parent cancels in-flight
sub-agents. This is the same [error/cancel split](./11-tools-and-mcp.md#error-semantics-throw--iserror-not-a-loop-crash)
as every other tool.

## Nested trace ids

Each sub-run gets a **child trace id** derived from the parent's, so a whole
delegation tree is reconstructable from the [logs](./08-logging-observability.md)
alone:

```
run  trace=a1b2                 coordinator (opus)
 ├─ tool:call delegate#1  →  run trace=a1b2.1   sub-agent (haiku)
 ├─ tool:call delegate#2  →  run trace=a1b2.2   sub-agent (haiku)
 └─ model:end trace=a1b2
```

`RunOptions.parentTrace` carries the parent id into the sub-run; the sub-agent mints
`a1b2.1`, `a1b2.2`, … The token usage of each sub-run is logged under its own trace
and can be rolled up into the parent's `AgentResult.usage` for a true cost-per-run
figure across the tree.

## Cheap models for fan-out

The point of delegation is often **breadth, not depth**: score twenty candidates,
summarize ten documents, classify a batch. That is exactly the job for the cheap
model. Sub-agents default to `claude-haiku-4-5` (see the
[model catalog](../specs/model-spec.md#model-catalog-defaults)); the coordinator stays
on `claude-opus-4-8` to do the reasoning that ties the results together.

```ts
const coordinator = createAgent({
  model: "claude-opus-4-8",                 // the planner
  system: coordinatorPrompt,
  tools: [delegateTool({
    research: () => createAgent({ model: "claude-haiku-4-5", system: researchPrompt, tools: [webSearch] }),
    score:    () => createAgent({ model: "claude-haiku-4-5", system: scorePrompt }),
  })],
})
```

Fan-out breadth is bounded by the `"subagents"` `ResourceManager` limit on the
`delegate` tool, so "delegate to twenty scorers" runs *N* at a time rather than
spawning twenty concurrent Opus-priced runs. Parallel delegations follow the same
[single-results-message rule](./11-tools-and-mcp.md#parallel-execution--one-results-message)
as any parallel tool calls.

## Context: shared by default? No — isolated by default

The default is **isolation**. A sub-agent starts with a **fresh conversation** and
shares nothing with the parent except what you put in the `task` string. This is a
deliberate choice:

- **Determinism & cost.** The sub-agent's context is exactly its task, so its behavior
  and token cost are predictable and its prompt cache prefix is stable.
- **Safety.** A fan-out worker can't accidentally see — or mutate — the coordinator's
  private reasoning or another sibling's state. Threads share nothing unless told.

| Concern | Isolated (default) | Shared (opt-in) |
|---|---|---|
| Conversation | Fresh per sub-run | Snapshot of parent passed in `input` |
| Memory | Own namespace | Same `Memory` backend / key prefix |
| Trace | Child id under parent | Child id under parent (always nested) |
| Cancellation | Inherited from parent | Inherited from parent |
| Best for | Fan-out, specialists | Tight collaboration on one thread |

To **share**, you pass it explicitly — for example a `conversation.snapshot()` as the
sub-agent's seed history, or the same `Memory` backend with an agreed key prefix.
Sharing is a snapshot hand-off, not a live shared object: the sub-agent can't mutate
the parent's conversation, matching the [immutable-snapshot](./12-memory-and-context.md#conversation--append-only-run-history)
guarantee.

## One-level delegation to start

The initial design is **one level deep**: a coordinator delegates to sub-agents, and
sub-agents do **not** themselves delegate. This matches the common, well-behaved
coordinator pattern and avoids the two hard problems of unbounded nesting — runaway
cost and non-obvious termination. Deeper trees are a later, deliberate step (with an
explicit depth bound), not a default.

The single-agent iteration bound still applies at every level: each sub-agent has its
own `maxIterations` ceiling and raises `AgentIterationLimitError` if it spins, exactly
as in the [agent loop](./09-agent-loop.md#iteration-control). Delegation adds breadth,
never an escape from the loop's guardrails.

## When to delegate vs stay single-agent

Delegation is not free — each sub-agent is a full extra loop with its own model calls.
Reach for it when the structure of the work actually calls for it:

**Delegate when:**

- The work **fans out** — many similar, independent subtasks (score/summarize/classify a
  batch). Cheap-model sub-agents in parallel are the whole win.
- A subtask needs a **different toolset or prompt** — a research specialist with web
  search, a code specialist with a sandbox — and you don't want those tools or that
  persona polluting the coordinator's context.
- You want **context isolation** — a subtask whose long, noisy transcript (a big file
  read, a verbose API dump) should not bloat the coordinator's window.

**Stay single-agent when:**

- The steps are **sequential and coupled** — each depends tightly on the last. One loop
  with the right tools is simpler and cheaper than a delegation round-trip.
- The tool set is **small and shared** — no isolation or specialization to gain.
- **Latency matters** — a delegation is at least one extra model round-trip; don't pay
  it for work the coordinator could do in-line.

The rule of thumb: **delegate for breadth and isolation; stay single-agent for
depth and coupling.**

## How it composes

```
System
 └─ Coordinator Agent (opus)  ── loop ──▶ Model ⇄ Tools
        └─ tool: delegate ──▶ runtime execution (bounded by "subagents" limit)
              └─ Sub-agent (haiku)  ── its OWN loop ──▶ Model ⇄ Tools
                    returns AgentResult.text  ──▶  tool_result to coordinator
```

Every arrow is machinery that already exists: the [loop](./09-agent-loop.md), the
[runtime](./05-runtime-execution.md) execution around each tool call, the
[tool contract](./11-tools-and-mcp.md), and per-run [conversations](./12-memory-and-context.md).
Multi-agent is composition, not a new subsystem. See the
[Agentic implementation plan](../plan/02-agentic-implementation-plan.md#package-6--multi-agent)
for the build order.
