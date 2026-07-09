import { describe, expect, it } from "vitest"

import { createExecutionEngine } from "../src/execution-engine"
import { createScheduler } from "../src/scheduler"
import type { ExecutionId, TaskId } from "../src/types"

function tid(id: string): TaskId {
  return id as TaskId
}

function eid(id: string): ExecutionId {
  return id as ExecutionId
}

describe("Scheduler", () => {
  it("should schedule and execute a task", async () => {
    const engine = createExecutionEngine()
    const scheduler = createScheduler(engine)

    engine.registerTask({
      id: tid("test"),
      handler: async (input: string) => `Hello ${input}`,
    })

    const result = await scheduler.schedule(tid("test"), "world")
    expect(result.state).toBe("completed")
    expect(result.output).toBe("Hello world")
  })

  it("should throw for unregistered task", async () => {
    const engine = createExecutionEngine()
    const scheduler = createScheduler(engine)

    await expect(scheduler.schedule(tid("missing"), {})).rejects.toThrow("not registered")
  })

  it("should cancel a running execution by ID", async () => {
    const engine = createExecutionEngine()
    const scheduler = createScheduler(engine)

    let capturedId: ExecutionId = eid("")

    engine.registerTask({
      id: tid("slow"),
      handler: async (_input, ctx) => {
        capturedId = ctx.executionId
        await new Promise((resolve) => setTimeout(resolve, 500))
        ctx.cancellationToken.throwIfCancelled()
        return "done"
      },
    })

    const execPromise = scheduler.schedule(tid("slow"), {})
    await new Promise((resolve) => setTimeout(resolve, 20))
    await scheduler.cancel(capturedId)
    const result = await execPromise

    expect(result.state).toBe("cancelled")
  })

  it("should return status of execution", async () => {
    const engine = createExecutionEngine()
    const scheduler = createScheduler(engine)

    engine.registerTask({
      id: tid("status-test"),
      handler: async () => "ok",
    })

    const result = await scheduler.schedule(tid("status-test"), {})
    const status = await scheduler.getStatus(result.id)

    expect(status).toBeDefined()
    expect(status?.state).toBe("completed")
    expect(status?.output).toBe("ok")
  })

  it("should return undefined for unknown execution status", async () => {
    const engine = createExecutionEngine()
    const scheduler = createScheduler(engine)

    const status = await scheduler.getStatus(tid("nonexistent") as unknown as ExecutionId)
    expect(status).toBeUndefined()
  })
})
