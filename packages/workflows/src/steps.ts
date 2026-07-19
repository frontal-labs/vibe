import type { RetryPolicy } from "vibe/runtime"

import type { WorkflowContext, WorkflowStep } from "./types"

/**
 * The building blocks for a workflow graph. The executor runs a workflow's steps
 * sequentially, threading each output into the next; branching and fan-out are
 * expressed as steps whose `run` composes other steps — so the executor stays
 * simple while sequential / parallel / conditional / map patterns are all supported.
 */

/** A plain step: run a function against the previous output. */
export function step<Input, Output>(
  id: string,
  run: (input: Input, ctx: WorkflowContext) => Output | Promise<Output>,
  options: { retry?: Partial<RetryPolicy> } = {},
): WorkflowStep<Input, Output> {
  return { id, run, retry: options.retry }
}

/**
 * Run several steps concurrently against the same input; the output is a record
 * keyed by each child step id. A barrier — resolves once all children settle.
 */
export function parallel(
  id: string,
  steps: readonly WorkflowStep[],
): WorkflowStep<unknown, Record<string, unknown>> {
  return {
    id,
    run: async (input, ctx) => {
      const results = await Promise.all(steps.map((s) => Promise.resolve(s.run(input, ctx))))
      const out: Record<string, unknown> = {}
      steps.forEach((s, i) => {
        out[s.id] = results[i]
      })
      return out
    },
  }
}

/** Route to one of two steps based on a predicate over the current input. */
export function conditional<Input, Output>(
  id: string,
  predicate: (input: Input, ctx: WorkflowContext) => boolean | Promise<boolean>,
  whenTrue: WorkflowStep<Input, Output>,
  whenFalse?: WorkflowStep<Input, Output>,
): WorkflowStep<Input, Output | undefined> {
  return {
    id,
    run: async (input, ctx) => {
      if (await predicate(input, ctx)) return whenTrue.run(input, ctx)
      return whenFalse ? whenFalse.run(input, ctx) : undefined
    },
  }
}

/** Map a per-item function over a collection selected from the input, concurrently. */
export function mapOver<Input, Item, Output>(
  id: string,
  select: (input: Input, ctx: WorkflowContext) => readonly Item[],
  each: (item: Item, ctx: WorkflowContext) => Output | Promise<Output>,
): WorkflowStep<Input, Output[]> {
  return {
    id,
    run: (input, ctx) => {
      const items = select(input, ctx)
      return Promise.all(items.map((item) => Promise.resolve(each(item, ctx))))
    },
  }
}
