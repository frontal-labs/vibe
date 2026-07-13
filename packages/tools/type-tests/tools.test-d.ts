import { expectAssignable, expectType } from "tsd"
import { z } from "zod"

import { type AnyTool, defineTool, runToolCall, type ToolResult } from "../src/index"

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

expectAssignable<AnyTool>(tool)
expectType<Promise<ToolResult>>(runToolCall(tool, { a: 1, b: 2 }))

// The literal tool name is captured in the type.
expectType<"add">(tool.name)

// Standard Schema (non-Zod) input is inferred in the handler.
import type { StandardSchemaV1 } from "@standard-schema/spec"

declare const custom: StandardSchemaV1<unknown, { city: string }>
const t2 = defineTool({
  name: "weather",
  description: "d",
  schema: custom,
  execute: (input) => {
    expectType<string>(input.city)
    return input.city
  },
})
expectType<"weather">(t2.name)
