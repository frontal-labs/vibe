# Multi-agent delegation

Expose a worker sub-agent to a coordinator as a `delegate` tool:

```ts
import { createAgent, createDelegateTool } from "frontal-vibe/agent"

const research = createDelegateTool({
  provider,
  name: "research",
  description: "Delegate a research subtask to a specialist.",
})
const coordinator = createAgent({ provider, tools: [research] })
```

Cancelling the coordinator cancels its workers. Runnable:
[`examples/multi-agent`](../examples/multi-agent).
