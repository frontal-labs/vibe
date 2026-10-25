import { expectType } from "tsd"

import {
  type CheckpointStore,
  createMemoryCheckpointStore,
  defineWorkflow,
  step,
  type Workflow,
  type WorkflowStep,
} from "../src/index"

expectType<CheckpointStore>(createMemoryCheckpointStore())

const double = step("double", (n: number) => n * 2)
expectType<WorkflowStep<number, number>>(double)
expectType<Workflow>(defineWorkflow({ name: "math", steps: [double] }))
// A workflow needs at least one step; the constructor rejects an empty list at runtime, and the
// type requires the steps field.
// @ts-expect-error: `steps` is required
defineWorkflow({ name: "empty" })
