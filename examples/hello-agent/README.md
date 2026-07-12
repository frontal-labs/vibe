# hello-agent

The smallest Vibe app: configure a system with a provider and `ask()` a question.

```sh
bun install
bun run --filter @example/hello-agent start          # offline (fake provider)
ANTHROPIC_API_KEY=sk-... bun run --filter @example/hello-agent start  # live
```
