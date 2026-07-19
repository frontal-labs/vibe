# governance

Put a policy engine in front of a tool with `vibe/governance`. Sensitive tools can
be denied outright or gated behind human approval — without forking the agent loop.

```sh
bun install
bun run --filter @example/governance start
```

What it shows:

- **`createPolicyEngine([...])`** — compose `allowTools`, `denyTools`,
  `requireApprovalFor` (evaluated in order) into one decision (`allow` / `deny` /
  `require-approval`).
- **`guardTool(tool, engine, { onApproval })`** — wraps a tool so each call is
  checked first. A blocked call returns an **error result** (not an exception), so
  the model sees the refusal and can respond. `actor` threads through to policies
  for actor-based rules.
