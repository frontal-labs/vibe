# multi-agent

One-level delegation: a coordinator agent calls a `delegate` tool that runs a worker
sub-agent and returns its answer — the coordinator/worker pattern.

```sh
bun install
ANTHROPIC_API_KEY=sk-... bun run --filter @example/multi-agent start
```

`createDelegateTool({ provider, name, description })` wraps a sub-agent as a tool.
The coordinator's cancellation token and logger flow into the worker's run, so
cancelling the coordinator cancels its workers. Pair workers with a cheaper model
(e.g. `claude-haiku-4-5`) for fan-out.
