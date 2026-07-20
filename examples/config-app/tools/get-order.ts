import { defineTool } from "@frontal-labs/vibe/tools"
import { z } from "zod"

const ORDERS: Record<string, string> = {
  "1001": "shipped, in transit",
  "1002": "delivered",
}

// A discovered tool: `tools/get-order.ts` → entry name `get-order`, default-exported.
export default defineTool({
  name: "get_order",
  description: "Look up an order's status by id.",
  schema: z.object({ id: z.string().describe("The order id") }),
  execute: ({ id }) => `Order ${id}: ${ORDERS[id] ?? "not found"}.`,
})
