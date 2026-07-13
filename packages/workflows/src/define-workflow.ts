import type { Workflow, WorkflowStep } from "./types"

export interface WorkflowDefinition {
  readonly name: string
  readonly description?: string
  readonly steps: readonly WorkflowStep[]
}

/**
 * Define a code-first workflow: a named, ordered graph of steps. Each step's
 * output feeds the next; use the `parallel`/`conditional`/`mapOver` step
 * constructors for fan-out and branching. The workflow is durable and resumable
 * when executed with a `runId` + checkpoint store.
 */
export function defineWorkflow(def: WorkflowDefinition): Workflow {
  if (def.steps.length === 0) {
    throw new Error(`Workflow "${def.name}" must have at least one step`)
  }
  const ids = new Set<string>()
  for (const step of def.steps) {
    if (ids.has(step.id)) {
      throw new Error(`Workflow "${def.name}" has a duplicate step id: "${step.id}"`)
    }
    ids.add(step.id)
  }
  return def
}
