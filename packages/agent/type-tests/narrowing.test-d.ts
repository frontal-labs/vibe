import { createFakeProvider } from "@vibe/model"
import { defineTool } from "@vibe/tools"
import { expectType } from "tsd"
import { z } from "zod"

import { createAgent } from "../src/agent"

const weather = defineTool({
  name: "get_weather",
  description: "d",
  schema: z.object({ city: z.string() }),
  execute: () => "x",
})
const search = defineTool({
  name: "search",
  description: "d",
  schema: z.object({ q: z.string(), limit: z.number() }),
  execute: () => "x",
})

const agent = createAgent({
  provider: createFakeProvider([{ content: [{ type: "text", text: "x" }] }]),
  tools: [weather, search],
})

// `stream()` yields tool-call events narrowed to exactly this agent's tools.
export async function narrows() {
  for await (const event of agent.stream("hi")) {
    if (event.type === "toolCall") {
      // name is the exact union of the agent's tool names
      expectType<"get_weather" | "search">(event.name)
      // narrowing on the name narrows the input to that tool's schema
      if (event.name === "get_weather") {
        expectType<{ city: string }>(event.input)
      }
      if (event.name === "search") {
        expectType<{ q: string; limit: number }>(event.input)
      }
    }
    if (event.type === "toolResult") {
      expectType<"get_weather" | "search">(event.name)
    }
  }
}

// An agent with no tools (or a dynamic registry) keeps the wide, string-typed events.
const dynamic = createAgent({
  provider: createFakeProvider([{ content: [{ type: "text", text: "x" }] }]),
})
export async function wide() {
  for await (const event of dynamic.stream("hi")) {
    if (event.type === "toolCall") {
      expectType<string>(event.name)
    }
  }
}
