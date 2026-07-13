# tool-use

Define a typed tool with Zod and let the agent call it. The Zod schema is the single
source of truth — it types the handler, validates input at runtime, and generates the
model-facing JSON Schema.

```sh
bun install
ANTHROPIC_API_KEY=sk-... bun run --filter @example/tool-use start
```

The result carries `text`, `iterations`, `stopReason`, `usage`, and the full
`transcript` — inspect them to see the tool call and its result flow through the loop.
