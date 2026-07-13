import { createCancellationTokenSource } from "@vibe/runtime"
import { describe, expect, it } from "vitest"

import { createMemoryCheckpointStore } from "../src/checkpoint-store"
import { defineWorkflow } from "../src/define-workflow"
import { runWorkflow } from "../src/executor"
import { conditional, mapOver, parallel, step } from "../src/steps"
import type { WorkflowEvent } from "../src/types"

describe("defineWorkflow", () => {
  it("rejects empty workflows and duplicate step ids", () => {
    expect(() => defineWorkflow({ name: "e", steps: [] })).toThrow(/at least one step/)
    const a = step("a", () => 1)
    expect(() => defineWorkflow({ name: "d", steps: [a, a] })).toThrow(/duplicate step id/)
  })
})

describe("executeWorkflow — sequential", () => {
  it("threads each step output into the next and returns the final output", async () => {
    const wf = defineWorkflow({
      name: "math",
      steps: [
        step<number, number>("double", (n) => n * 2),
        step<number, number>("inc", (n) => n + 1),
      ],
    })
    const result = await runWorkflow(wf, { input: 10 })
    expect(result.status).toBe("completed")
    expect(result.output).toBe(21)
    expect(result.outputs).toEqual({ double: 20, inc: 21 })
  })
})

describe("executeWorkflow — durability", () => {
  it("resumes from checkpoint after a failed step and completes", async () => {
    const store = createMemoryCheckpointStore()
    let attempts = 0
    const wf = defineWorkflow({
      name: "flaky",
      steps: [
        step<number, number>("first", (n) => n + 1),
        step<number, number>("second", (n) => {
          attempts += 1
          if (attempts === 1) throw new Error("boom")
          return n * 10
        }),
        step<number, number>("third", (n) => n - 5),
      ],
    })

    // First run fails at "second"; "first" is checkpointed.
    const failed = await runWorkflow(wf, { runId: "run-1", input: 1, store })
    expect(failed.status).toBe("failed")
    expect(failed.error?.message).toBe("boom")

    // Resume with the same runId + store: "first" is skipped, "second" now succeeds.
    const events: WorkflowEvent[] = []
    const ok = await runWorkflow(wf, {
      runId: "run-1",
      store,
      onEvent: (e) => events.push(e),
    })
    expect(ok.status).toBe("completed")
    expect(ok.output).toBe(15) // (1+1=2) -> 2*10=20 -> 20-5=15
    expect(events.some((e) => e.type === "step:skipped" && e.step === "first")).toBe(true)
    expect(events[0]).toMatchObject({ type: "workflow:start", resumed: true })
    expect(attempts).toBe(2)
  })
})

describe("executeWorkflow — composition", () => {
  it("runs steps in parallel and branches conditionally", async () => {
    const wf = defineWorkflow({
      name: "compose",
      steps: [
        parallel("fanout", [step("a", (n: number) => n + 1), step("b", (n: number) => n + 2)]),
        conditional<Record<string, number>, string>(
          "branch",
          (out) => out.a > 0,
          step("yes", () => "positive"),
          step("no", () => "non-positive"),
        ),
      ],
    })
    const result = await runWorkflow(wf, { input: 5 })
    expect(result.outputs.fanout).toEqual({ a: 6, b: 7 })
    expect(result.output).toBe("positive")
  })

  it("maps a per-item function over a collection", async () => {
    const wf = defineWorkflow({
      name: "map",
      steps: [
        mapOver<number[], number, number>(
          "squares",
          (xs) => xs,
          (x) => x * x,
        ),
      ],
    })
    const result = await runWorkflow(wf, { input: [1, 2, 3] })
    expect(result.output).toEqual([1, 4, 9])
  })
})

describe("executeWorkflow — cancellation", () => {
  it("stops the run when the shared token is cancelled", async () => {
    const source = createCancellationTokenSource()
    const wf = defineWorkflow({
      name: "cancelme",
      steps: [
        step("one", () => {
          source.cancel("stop")
          return 1
        }),
        step("two", () => 2),
      ],
    })
    const result = await runWorkflow(wf, { input: 0, cancellationToken: source.token })
    expect(result.status).toBe("cancelled")
    expect(result.outputs.two).toBeUndefined()
  })
})

describe("executeWorkflow — tracing", () => {
  it("opens a workflow span with nested step spans", async () => {
    const spans: string[] = []
    const tracer = {
      startSpan: (name: string, parent?: string) => {
        spans.push(parent ? `${name} (child)` : name)
        return {
          id: name,
          setAttribute: () => {},
          setStatus: () => {},
          end: () => ({}),
        }
      },
    }
    const wf = defineWorkflow({ name: "traced", steps: [step("only", () => "x")] })
    await runWorkflow(wf, { input: 1, tracer })
    expect(spans).toContain("workflow traced")
    expect(spans).toContain("step only (child)")
  })
})
