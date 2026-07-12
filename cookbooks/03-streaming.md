# Streaming responses

```ts
for await (const event of agent.stream("Tell me a story.")) {
  if (event.type === "text") process.stdout.write(event.delta)
  if (event.type === "toolCall") console.log(`\n→ ${event.name}`)
  if (event.type === "done") console.log(`\n[${event.result.iterations} iterations]`)
}
```

`stream()` returns an `AsyncGenerator<AgentEvent, AgentResult>` — the final result
is the generator's return value. Runnable: [`examples/streaming`](../examples/streaming).
