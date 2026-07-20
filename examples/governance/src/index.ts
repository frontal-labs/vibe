import { createAgent } from "@frontal-labs/vibe/agent"
import { createPolicyEngine, guardTool, requireApprovalFor } from "@frontal-labs/vibe/governance"
import { createAnthropicProvider } from "@frontal-labs/vibe/model"
import { defineTool } from "@frontal-labs/vibe/tools"
import { z } from "zod"

const issueRefund = defineTool({
  name: "issue_refund",
  description: "Issue a refund to a customer.",
  schema: z.object({ orderId: z.string(), amount: z.number() }),
  execute: ({ orderId, amount }) => `Refunded $${amount} for order ${orderId}.`,
})

// Policy: refunds require human approval; anything else is allowed. Compose more
// rules with `allowTools` / `denyTools`; policies evaluate in order.
const engine = createPolicyEngine([requireApprovalFor(["issue_refund"])])

// Guard the tool: every call is checked first. A deny or unapproved call returns an
// error *result* the model can react to — it never throws into the agent loop.
const guarded = guardTool(issueRefund, engine, {
  actor: "agent:support",
  onApproval: (req) => {
    console.log(`⚠️  approval requested: ${req.tool}(${JSON.stringify(req.input)})`)
    return false // deny in this demo — flip to `true` to let the refund through
  },
})

const agent = createAgent({ provider: createAnthropicProvider(), tools: [guarded] })
console.log((await agent.run("Refund $20 on order 1001.")).text)
