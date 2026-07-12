import { describe, expect, it } from "vitest"

import { all, exactMatch, includes, regexMatch } from "../src/graders"
import { runEval } from "../src/run-eval"
import type { EvalCase } from "../src/types"

const cases: EvalCase[] = [
  { name: "greet", input: "hi", expected: "hello" },
  { name: "math", input: "2+2", expected: "4" },
]

describe("graders", () => {
  it("exactMatch honors trim + ignoreCase", () => {
    expect(exactMatch()(" hello ", cases[0]!).passed).toBe(true)
    expect(exactMatch({ ignoreCase: true })("HELLO", cases[0]!).passed).toBe(true)
    expect(exactMatch()("nope", cases[0]!).passed).toBe(false)
  })
  it("includes finds a substring", () => {
    expect(includes()("well hello there", cases[0]!).passed).toBe(true)
    expect(includes()("bye", cases[0]!).passed).toBe(false)
  })
  it("regexMatch tests a pattern", () => {
    expect(regexMatch(/\d+/)("the answer is 4", cases[1]!).passed).toBe(true)
    expect(regexMatch(/\d+/)("no digits", cases[1]!).passed).toBe(false)
  })
  it("all passes only if every grader passes; score is the mean", async () => {
    const grader = all(includes(), regexMatch(/hello/))
    const both = await grader("hello", cases[0]!)
    expect(both.passed).toBe(true)
    expect(both.score).toBe(1)
    const one = await grader("hello 4", { ...cases[0]!, expected: "hello" })
    expect(one.passed).toBe(true)
  })
})

describe("runEval", () => {
  it("aggregates a pass-rate report", async () => {
    const report = await runEval({
      cases,
      run: (input) => (input === "hi" ? "hello" : "4"),
      grader: exactMatch(),
    })
    expect(report.total).toBe(2)
    expect(report.passed).toBe(2)
    expect(report.passRate).toBe(1)
    expect(report.results.map((r) => r.name)).toEqual(["greet", "math"])
  })

  it("counts failures and scores a throwing run as 0", async () => {
    const report = await runEval({
      cases,
      run: (input) => {
        if (input === "2+2") throw new Error("boom")
        return "hello"
      },
      grader: exactMatch(),
    })
    expect(report.passed).toBe(1)
    expect(report.failed).toBe(1)
    expect(report.passRate).toBe(0.5)
    const mathResult = report.results.find((r) => r.name === "math")
    expect(mathResult?.detail).toContain("boom")
  })
})
