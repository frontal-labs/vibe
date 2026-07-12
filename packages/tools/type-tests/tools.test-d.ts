import { expectAssignable, expectType } from "tsd"
import { z } from "zod"

import { defineTool, runToolCall, type Tool, type ToolResult } from "../src/index"

const tool = defineTool({
  name: "add",
  description: "adds",
  schema: z.object({ a: z.number(), b: z.number() }),
  execute: (input) => {
    // input is inferred from the Zod schema
    expectType<number>(input.a)
    expectType<number>(input.b)
    return String(input.a + input.b)
  },
})

expectAssignable<Tool>(tool)
expectType<Promise<ToolResult>>(runToolCall(tool, { a: 1, b: 2 }))
