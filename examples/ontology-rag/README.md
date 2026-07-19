# ontology-rag

Retrieval-augmented grounding with `vibe/ontology`: upsert records into a semantic
store and let an agent retrieve them by similarity to ground its answers.

```sh
bun install
ANTHROPIC_API_KEY=sk-... bun run --filter @example/ontology-rag start
```

What it shows:

- **`createInMemoryOntologyStore`** — an in-memory vector store with a dependency-free
  hashing embedder by default; the `Embedder` is pluggable (pgvector, a hosted model).
- **`retrieveContext(store, query)`** — the grounding text RAG injects into a prompt.
- **`createRetrieveTool(store)`** — exposes retrieval as a tool so the agent fetches
  context mid-loop, only when it needs it. Wire a `store` into `vibe.config.ts`'s
  `ontology` section to attach retrieval to a whole system.
