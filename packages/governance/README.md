# vibe/governance

Policy engine and approval gates for tool execution.

## What it does

Build a `PolicyEngine` (`createPolicyEngine`) with rules like `allowTools`,
`denyTools`, and `requireApprovalFor`, guard tools via `guardTool`, and gate
human approvals with `createApprovalGate`.

## Install

```sh
bun add vibe/governance
```

## Usage

```ts
import { createPolicyEngine, requireApprovalFor, guardTool } from "@vibe/governance"

const engine = createPolicyEngine([requireApprovalFor(["deleteRecord"])])
const safe = guardTool(tool, engine)
```
