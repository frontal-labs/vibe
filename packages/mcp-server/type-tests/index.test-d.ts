import { expectType } from "tsd"
import { z } from "zod"
import type { McpTool } from "../src/types"

const tool: McpTool = {
  name: "ping",
  description: "noop",
  schema: z.object({}),
  async execute() {
    return "pong"
  },
}
expectType<McpTool>(tool)
