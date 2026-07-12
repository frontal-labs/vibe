/** One eval case: an input, and what a correct answer looks like. */
export interface EvalCase {
  readonly name: string
  readonly input: string
  /** Reference answer (graders interpret it — exact text, substring, or pattern). */
  readonly expected?: string
  /** Free-form metadata a custom grader can use. */
  readonly meta?: Readonly<Record<string, unknown>>
}

/** The outcome of grading one case. */
export interface GradeResult {
  readonly passed: boolean
  /** 0..1 score; graders that only pass/fail use 1 or 0. */
  readonly score: number
  readonly detail?: string
}

/** Grades an actual `output` against a `case`. */
export type Grader = (output: string, evalCase: EvalCase) => GradeResult | Promise<GradeResult>

/** Produces an actual output for a case's input (usually `agent.run(input).text`). */
export type RunFn = (input: string) => string | Promise<string>

/** Per-case result inside a report. */
export interface EvalCaseResult extends GradeResult {
  readonly name: string
  readonly input: string
  readonly output: string
}

/** The aggregate result of running an eval suite. */
export interface EvalReport {
  readonly total: number
  readonly passed: number
  readonly failed: number
  readonly passRate: number
  readonly meanScore: number
  readonly results: readonly EvalCaseResult[]
}

export interface EvalSuite {
  readonly cases: readonly EvalCase[]
  readonly grader: Grader
}
