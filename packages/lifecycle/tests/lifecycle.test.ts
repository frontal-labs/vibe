import { describe, it, expect, vi } from "vitest"

import { createLifecycle } from "../src/lifecycle"
import type { LifecycleState } from "../src/state"

describe("Lifecycle", () => {
  it("should start in created state", () => {
    const lc = createLifecycle()
    expect(lc.state).toBe("created")
  })

  it("should transition from created to ready on start", async () => {
    const lc = createLifecycle()
    await lc.start()
    expect(lc.state).toBe("ready")
  })

  it("should transition from created to initializing on init", async () => {
    const lc = createLifecycle()
    await lc.init()
    expect(lc.state).toBe("initializing")
  })

  it("should transition from initializing to ready on start", async () => {
    const lc = createLifecycle()
    await lc.init()
    await lc.start()
    expect(lc.state).toBe("ready")
  })

  it("should transition to stopping on stop from ready", async () => {
    const lc = createLifecycle()
    await lc.start()
    await lc.stop()
    expect(lc.state).toBe("stopped")
  })

  it("should transition to stopped on stop from created", async () => {
    const lc = createLifecycle()
    await lc.stop()
    expect(lc.state).toBe("stopped")
  })

  it("should fire onBefore handlers in priority order", async () => {
    const lc = createLifecycle()
    const order: number[] = []

    lc.onBefore(
      "start",
      () => {
        order.push(2)
      },
      { priority: 0 },
    )
    lc.onBefore(
      "start",
      () => {
        order.push(1)
      },
      { priority: 10 },
    )

    await lc.start()
    expect(order).toEqual([1, 2])
  })

  it("should fire onAfter handlers after state transition", async () => {
    const lc = createLifecycle()
    const events: { state: LifecycleState; phase: string }[] = []

    lc.onAfter("start", () => {
      events.push({ state: lc.state, phase: "after" })
    })

    await lc.start()
    expect(events).toHaveLength(1)
    expect(events[0]?.state).toBe("ready")
  })

  it("should fire onBefore before state transition", async () => {
    const lc = createLifecycle()
    const states: LifecycleState[] = []

    lc.onBefore("start", () => {
      states.push(lc.state)
    })
    lc.onAfter("start", () => {
      states.push(lc.state)
    })

    await lc.start()
    expect(states).toEqual(["created", "ready"])
  })

  it("should call async handlers", async () => {
    const lc = createLifecycle()
    const called = vi.fn()

    lc.onBefore("start", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      called()
    })

    await lc.start()
    expect(called).toHaveBeenCalledOnce()
  })

  it("should throw on invalid transition", async () => {
    const lc = createLifecycle()
    await lc.start()

    await expect(lc.init()).rejects.toThrow()
    expect(lc.state).toBe("ready")
  })

  it("should stop gracefully with timeout", async () => {
    const lc = createLifecycle()
    await lc.start()

    lc.onBefore("stop", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })

    await lc.stop(1000)
    expect(lc.state).toBe("stopped")
  })

  it("should timeout on stop if handlers take too long", async () => {
    const lc = createLifecycle()
    await lc.start()

    lc.onBefore("stop", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    })

    await expect(lc.stop(10)).rejects.toThrow()
    expect(lc.state).toBe("errored")
  })

  it("should transition to errored on handler failure", async () => {
    const lc = createLifecycle()
    await lc.start()

    lc.onBefore("stop", () => {
      throw new Error("handler failed")
    })

    await expect(lc.stop()).rejects.toThrow()
    expect(lc.state).toBe("errored")
  })

  it("should support multiple handlers for same event", async () => {
    const lc = createLifecycle()
    const called: string[] = []

    lc.onBefore("start", () => {
      called.push("first")
    })
    lc.onBefore("start", () => {
      called.push("second")
    })
    lc.onAfter("start", () => {
      called.push("after")
    })

    await lc.start()
    expect(called).toEqual(["first", "second", "after"])
  })

  it("should be idempotent - start on ready stays ready", async () => {
    const lc = createLifecycle()
    await lc.start()
    await lc.start()
    expect(lc.state).toBe("ready")
  })

  it("should be idempotent - stop on stopped stays stopped", async () => {
    const lc = createLifecycle()
    await lc.stop()
    await lc.stop()
    expect(lc.state).toBe("stopped")
  })
})
