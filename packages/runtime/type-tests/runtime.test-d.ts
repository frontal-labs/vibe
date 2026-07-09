import { expectError, expectType } from "tsd"

import { createCancellationTokenSource, createRuntime } from "../src/index"
import type { CancellationToken, ExecutionContext, Runtime, TaskDefinition } from "../src/index"

const runtime = createRuntime()
expectType<Runtime>(runtime)

// CancellationTokenSource
const source = createCancellationTokenSource()
expectType<CancellationToken>(source.token)
expectType<boolean>(source.token.cancelled)
expectError(source.token.cancel())

// TaskDefinition
const task: TaskDefinition<string, number> = {
  id: "test" as TaskId,
  handler: async (input: string, _ctx: ExecutionContext): Promise<number> => {
    return input.length
  },
}
runtime.registerTask(task)

// ExecutionContext type
expectType<ExecutionContext>({} as ExecutionContext)
expectType<string>(({} as ExecutionContext).executionId as unknown as string)
expectType<number>(({} as ExecutionContext).attempt)
expectType<CancellationToken>(({} as ExecutionContext).cancellationToken)

import type { TaskId } from "../src/index"
