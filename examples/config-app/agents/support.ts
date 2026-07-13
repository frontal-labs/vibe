import { createAgent } from "vibe/agent"
import { createAnthropicProvider } from "vibe/model"

import getOrder from "../tools/get-order"

// A discovered agent: `agents/support.ts` → entry name `support`, default-exported.
// It imports its tools from `../tools/*`; that import is exactly the edge the
// bundler follows to code-split each tool into its own lazily-loaded chunk.
export default createAgent({
  provider: createAnthropicProvider(),
  system: "You are a support agent. Look up orders before answering.",
  tools: [getOrder],
})
