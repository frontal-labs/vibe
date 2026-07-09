import { describe, expect, it, vi } from "vitest"

import { createExecutionEngine } from "../src/execution-engine"
import type { ExecutionId, TaskId } from "../src/types"

function tid(id: string): TaskId {
  return id as TaskId
}

function eid(id: string): ExecutionId {
  return id as ExecutionId
}

describe("ExecutionEngine", () => {
  it("should register and execute a task", async () => {
    const engine = createExecutionEngine()
    const handler = vi.fn().mockResolvedValue("hello")

    engine.registerTask({
      id: tid("greet"),
      handler,
    })

    const result = await engine.execute(tid("greet"), "world")

    expect(result.state).toBe("completed")
    expect(result.output).toBe("hello")
    expect(result.attempts).toBe(1)
    expect(handler).toHaveBeenCalledWith("world", expect.any(Object))
  })

  it("should fail when task is not registered", async () => {
    const engine = createExecutionEngine()
    await expect(engine.execute(tid("missing"), {})).rejects.toThrow("not registered")
  })

  it("should fail on duplicate registration", () => {
    const engine = createExecutionEngine()
    engine.registerTask({
      id: tid("dup"),
      handler: async () => "ok",
    })
    expect(() => {
      engine.registerTask({
        id: tid("dup"),
        handler: async () => "also ok",
      })
    }).toThrow("already registered")
  })

  it("should return failed result when handler throws", async () => {
    const engine = createExecutionEngine()
    engine.registerTask({
      id: tid("failing"),
      handler: async () => {
        throw new Error("oops")
      },
    })

    const result = await engine.execute(tid("failing"), {})

    expect(result.state).toBe("failed")
    expect(result.error?.message).toBe("oops")
  })

  it("should return cancelled result when cancelled by executionId", async () => {
    const engine = createExecutionEngine()

    let capturedExecutionId: ExecutionId = eid("")

    engine.registerTask({
      id: tid("slow"),
      handler: async (_input, ctx) => {
        capturedExecutionId = ctx.executionId
        await new Promise((resolve) => setTimeout(resolve, 500))
        ctx.cancellationToken.throwIfCancelled()
        return "done"
      },
    })

    const executionPromise = engine.execute(tid("slow"), {})

    await new Promise((resolve) => setTimeout(resolve, 50))
    engine.cancel(capturedExecutionId)

    const result = await executionPromise
    expect(result.state).toBe("cancelled")
  })

  it("should cancel execution by captured id", async () => {
    const engine = createExecutionEngine()

    let capturedId: ExecutionId = eid("")

    engine.registerTask({
      id: tid("cancel-me"),
      handler: async (_input, ctx) => {
        capturedId = ctx.executionId
        await new Promise((resolve) => setTimeout(resolve, 300))
        ctx.cancellationToken.throwIfCancelled()
        return "too late"
      },
    })

    const execPromise = engine.execute(tid("cancel-me"), {})
    await new Promise((resolve) => setTimeout(resolve, 20))
    engine.cancel(capturedId)
    const result = await execPromise

    expect(result.state).toBe("cancelled")
  })

  it("should support streaming execution with progress events", async () => {
    const engine = createExecutionEngine()
    engine.registerTask({
      id: tid("streaming"),
      handler: async (_input, ctx) => {
        ctx.progress("step1")
        ctx.progress("step2")
        return "done"
      },
    })

    const types: Array<string> = []
    const values: Array<unknown> = []
    for await (const event of engine.stream(tid("streaming"), {})) {
      types.push(event.type)
      if (event.type === "progress") {
        values.push(event.value)
      }
    }

    expect(types).toContain("start")
    expect(types).toContain("progress")
    expect(values).toContain("step1")
    expect(values).toContain("step2")
    expect(types).toContain("complete")
  })

  it("should support checkpointing via execution context", async () => {
    const engine = createExecutionEngine()
    let capturedId: ExecutionId = eid("")

    engine.registerTask({
      id: tid("checkpointing"),
      handler: async (_input, ctx) => {
        capturedId = ctx.executionId
        const ckptId = await ctx.checkpoint({ progress: 0.5 })
        return { checkpointId: ckptId, progress: 0.5 }
      },
    })

    const result = await engine.execute(tid("checkpointing"), {})
    expect(result.state).toBe("completed")
    expect(result.output).toBeDefined()

    const ckpt = engine.getCheckpoint(capturedId)
    expect(ckpt).toBeDefined()
    expect(ckpt?.state).toEqual({ progress: 0.5 })
  })

  it("should list active executions", async () => {
    const engine = createExecutionEngine()
    engine.registerTask({
      id: tid("active-test"),
      handler: async () => "done",
    })

    await engine.execute(tid("active-test"), {})
    const active = engine.listActiveExecutions()

    expect(Array.isArray(active)).toBe(true)
  })
})
