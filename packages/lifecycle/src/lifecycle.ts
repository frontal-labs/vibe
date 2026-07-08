import { assertDefined } from "@vibe/shared"
import { lifecycleError } from "@vibe/errors"

import type {
  LifecycleEvent,
  LifecycleHandler,
  LifecycleState,
} from "./state"
import { isValidTransition, transitionState } from "./state"

interface HandlerEntry {
  handler: LifecycleHandler
  priority: number
}

export interface Lifecycle {
  readonly state: LifecycleState
  onBefore(event: LifecycleEvent, handler: LifecycleHandler, options?: { priority?: number }): void
  onAfter(event: LifecycleEvent, handler: LifecycleHandler): void
  init(): Promise<void>
  start(): Promise<void>
  stop(timeoutMs?: number): Promise<void>
}

export function createLifecycle(initialState: LifecycleState = "created"): Lifecycle {
  let currentState: LifecycleState = initialState
  const beforeHandlers = new Map<LifecycleEvent, HandlerEntry[]>()
  const afterHandlers = new Map<LifecycleEvent, LifecycleHandler[]>()

  function getBeforeHandlers(event: LifecycleEvent): HandlerEntry[] {
    let handlers = beforeHandlers.get(event)
    if (!handlers) {
      handlers = []
      beforeHandlers.set(event, handlers)
    }
    return handlers
  }

  function getAfterHandlers(event: LifecycleEvent): LifecycleHandler[] {
    let handlers = afterHandlers.get(event)
    if (!handlers) {
      handlers = []
      afterHandlers.set(event, handlers)
    }
    return handlers
  }

  function addHandler(
    event: LifecycleEvent,
    handler: LifecycleHandler,
    type: "before" | "after",
    priority?: number,
  ): void {
    if (type === "before") {
      const entries = getBeforeHandlers(event)
      entries.push({ handler, priority: priority ?? 0 })
      entries.sort((a, b) => b.priority - a.priority)
    } else {
      getAfterHandlers(event).push(handler)
    }
  }

  async function executeEvent(event: LifecycleEvent): Promise<void> {
    if (!isValidTransition(currentState, event)) {
      throw lifecycleError(
        `Cannot ${event} from state "${currentState}"`,
      )
    }

    const before = getBeforeHandlers(event)
    for (const entry of before) {
      await entry.handler()
    }

    currentState = transitionState(currentState, event)

    const after = getAfterHandlers(event)
    for (const handler of after) {
      await handler()
    }
  }

  async function init(): Promise<void> {
    await executeEvent("init")
  }

  async function start(): Promise<void> {
    await executeEvent("start")
  }

  async function stop(timeoutMs?: number): Promise<void> {
    const actualTimeout = timeoutMs ?? 30000

    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(lifecycleError(`Shutdown timed out after ${actualTimeout}ms`))
      }, actualTimeout)
    })

    try {
      await Promise.race([executeEvent("stop"), timeoutPromise])
    } catch (error) {
      currentState = "errored"
      throw error
    }
  }

  return {
    get state(): LifecycleState {
      return currentState
    },
    onBefore(
      event: LifecycleEvent,
      handler: LifecycleHandler,
      options?: { priority?: number },
    ) {
      addHandler(event, handler, "before", options?.priority)
    },
    onAfter(event: LifecycleEvent, handler: LifecycleHandler) {
      addHandler(event, handler, "after")
    },
    init,
    start,
    stop,
  }
}
