import type { EvalCase, EvalCaseResult, EvalReport, Grader, RunFn } from "./types"

export interface RunEvalOptions {
  readonly cases: readonly EvalCase[]
  readonly run: RunFn
  readonly grader: Grader
  /** Max cases to run in parallel (default 4). */
  readonly concurrency?: number
}

/**
 * Run an eval suite: produce an output per case via `run`, grade each with
 * `grader`, and aggregate into a pass-rate report. Cases run with bounded
 * concurrency; a case whose `run` throws is scored 0 with the error as detail.
 */
export async function runEval(options: RunEvalOptions): Promise<EvalReport> {
  const { cases, run, grader } = options
  const limit = Math.max(1, options.concurrency ?? 4)
  const results: EvalCaseResult[] = new Array(cases.length)

  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < cases.length) {
      const index = cursor++
      const c = cases[index]
      if (!c) continue
      try {
        const output = await run(c.input)
        const grade = await grader(output, c)
        results[index] = { name: c.name, input: c.input, output, ...grade }
      } catch (error) {
        results[index] = {
          name: c.name,
          input: c.input,
          output: "",
          passed: false,
          score: 0,
          detail: error instanceof Error ? error.message : String(error),
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, cases.length) }, () => worker()))

  const passed = results.filter((r) => r.passed).length
  const meanScore = results.reduce((s, r) => s + r.score, 0) / (results.length || 1)
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length ? passed / results.length : 0,
    meanScore,
    results,
  }
}
