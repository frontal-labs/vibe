# streaming

Consume `agent.stream()` and handle events as they arrive — text/thinking deltas,
tool calls, and the final result all come through one async iterator.

```sh
bun install
ANTHROPIC_API_KEY=sk-... bun run --filter @example/streaming start
```

`run()` is just `stream()` drained to the final result — reach for `stream()` when
you want to render tokens live or react to tool calls mid-flight.
