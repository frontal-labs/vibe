# Vibe examples

Runnable, self-contained Vibe apps. Each is a small, focused program that runs
against the live Anthropic API — set `ANTHROPIC_API_KEY` in your environment first.

```sh
bun install
ANTHROPIC_API_KEY=sk-... bun run --filter @example/hello-agent start   # any example
```

## Basics

| Example | Shows |
|---------|-------|
| [hello-agent](./hello-agent) | The smallest app: `vibe.system({ provider }).ask()` |
| [tool-use](./tool-use) | A typed Zod tool the agent calls |
| [streaming](./streaming) | `agent.stream()` — text/thinking/tool events live |
| [multi-agent](./multi-agent) | Coordinator → worker delegation via `createDelegateTool` |
| [http-server](./http-server) | Serve an agent over HTTP/SSE with `vibe/adapters` |

## Building real apps

| Example | Shows |
|---------|-------|
| [config-app](./config-app) | Convention layout: `vibe.config.ts` + auto-discovered `agents/` & `tools/` |
| [workflow](./workflow) | Durable, resumable DAGs (`defineWorkflow` / `step` / `parallel`) |
| [skills](./skills) | Code + markdown procedure skills on a system |
| [ontology-rag](./ontology-rag) | Semantic retrieval (RAG) grounding |

## Enterprise layer

| Example | Shows |
|---------|-------|
| [governance](./governance) | Policy engine + `guardTool` (deny / require approval) |
| [observability](./observability) | `observeAgent`: metrics, audit trail, USD cost |
| [eval-suite](./eval-suite) | Score an agent against cases with `vibe/evals` |
| [traced-run](./traced-run) | Span tree per run with `vibe/tracing` |

Each directory has its own README with details and run commands.
