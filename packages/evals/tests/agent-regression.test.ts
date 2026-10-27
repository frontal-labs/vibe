import { createAgent } from "vibe/agent"
import { createPolicyEngine, denyTools } from "vibe/governance"
import { createInMemoryMemory, type Message } from "vibe/memory"
import type { ModelProvider, ModelRequest, ModelResponse, ModelStreamEvent } from "vibe/model"
import { defineTool } from "vibe/tools"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { agentRunFn, assertPassRate } from "../src/agent-eval"
import { all, includes } from "../src/graders"
import { runEval } from "../src/run-eval"
import type { EvalCase, RunFn } from "../src/types"

/**
 * A deterministic stand-in for a model. It acts on the last message it sees: it asks for the
 * `lookup` tool when the user says "lookup", echoes tool results back, and otherwise answers from
 * the transcript length so memory is observable.
 */
function stubModel(): ModelProvider {
  const respond = (request: ModelRequest): ModelResponse => {
    const last = request.messages.at(-1) as Message
    const content = last.content
    let text: string
    let blocks: ModelResponse["content"] = []
    if (Array.isArray(content) && content.some((b) => b.type === "toolResult")) {
      const result = content.find((b) => b.type === "toolResult")
      text = `Final: ${result?.type === "toolResult" ? result.content : ""}`
      blocks = [{ type: "text", text }]
    } else if (typeof content === "string" && content.includes("lookup")) {
      blocks = [{ type: "toolUse", id: "t1", name: "lookup", input: { id: "42" } }]
      return {
        content: blocks,
        stopReason: "tool_use",
        usage: { inputTokens: 0, outputTokens: 0 },
        model: "stub",
      }
    } else {
      text = `history:${request.messages.length}`
      blocks = [{ type: "text", text }]
    }
    return {
      content: blocks,
      stopReason: "end_turn",
      usage: { inputTokens: 0, outputTokens: 0 },
      model: "stub",
    }
  }
  return {
    id: "stub",
    // biome-ignore lint/suspicious/useAwait: interface requires Promise return
    async generate(request) {
      return respond(request)
    },
    // biome-ignore lint/suspicious/useAwait: interface requires AsyncIterable return
    async *stream(request): AsyncIterable<ModelStreamEvent> {
      const response = respond(request)
      for (const block of response.content) {
        if (block.type === "text") yield { type: "text", delta: block.text }
      }
      yield { type: "done", response }
    },
  }
}

const lookup = defineTool({
  name: "lookup",
  description: "look up an order",
  schema: z.object({ id: z.string() }),
  execute: (input) => `order ${input.id} shipped`,
})

const memory = createInMemoryMemory()
const agent = createAgent({
  provider: stubModel(),
  tools: [lookup],
  memory,
  governance: { engine: createPolicyEngine([denyTools(["lookup"])]) },
})
const open = createAgent({ provider: stubModel(), tools: [lookup] })

/** Each case declares its own route, so one suite covers tools, refusals, and memory. */
const cases: EvalCase[] = [
  {
    name: "tool result reaches the answer",
    input: "please lookup order",
    expected: "order 42 shipped",
  },
  { name: "answers without tools", input: "hello", expected: "history:1" },
]

describe("agent regression suite", () => {
  it("passes every case against the agent (CI gate)", async () => {
    const run = agentRunFn(open)
    const report = await runEval({
      cases,
      run,
      grader: all(includes()),
    })
    assertPassRate(report, 1)
    expect(report.passRate).toBe(1)
  })

  it("catches a regression: a denied tool cannot reach the answer", async () => {
    const report = await runEval({
      cases: [cases[0]!],
      run: agentRunFn(agent),
      grader: all(includes()),
    })
    expect(report.passRate).toBe(0)
    expect(() => assertPassRate(report, 1)).toThrow(/tool result reaches the answer/)
  })

  it("keeps conversations across runs when the suite passes a conversationId", async () => {
    const run: RunFn = async (input) =>
      (await agent.run({ text: input }, { conversationId: "eval-session" })).text
    const first = await run("hello")
    const second = await run("hello again")
    expect(first).toBe("history:1")
    expect(second).toBe("history:3")
    expect((await memory.load("eval-session")).length).toBe(4)
  })
})
