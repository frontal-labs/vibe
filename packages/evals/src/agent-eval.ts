import { runtimeError } from "vibe/errors"

import type { EvalReport, RunFn } from "./types"

/** Anything with a `run` that resolves to `{ text }`. `vibe/agent` agents satisfy this structurally. */
export interface RunnableAgent {
  run(input: { text: string }, options?: object): Promise<{ text: string }>
}

/**
 * Adapt an agent into the `RunFn` an eval suite drives. `options` is passed to every run, so a suite
 * can carry per-run settings such as a governance actor or a conversation id.
 */
export function agentRunFn(agent: RunnableAgent, options?: object): RunFn {
  return async (input) => (await agent.run({ text: input }, options)).text
}

/**
 * The CI gate for an eval report: throws when the pass rate is below `minimum`, naming the failing
 * cases and why they failed, so a regression fails the build instead of passing silently.
 */
export function assertPassRate(report: EvalReport, minimum: number): void {
  if (report.passRate >= minimum) return
  const failing = report.results
    .filter((result) => !result.passed)
    .map((result) => (result.detail ? `${result.name} (${result.detail})` : result.name))
  throw runtimeError(
    `Eval pass rate ${(report.passRate * 100).toFixed(1)}% is below ${(minimum * 100).toFixed(1)}%. ` +
      `Failing: ${failing.join(", ")}`,
  )
}
