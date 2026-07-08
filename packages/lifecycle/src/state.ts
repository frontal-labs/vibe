export const LIFECYCLE_STATES = [
  "created",
  "initializing",
  "ready",
  "stopping",
  "stopped",
  "errored",
] as const

export type LifecycleState = (typeof LIFECYCLE_STATES)[number]

export type LifecycleEvent = "init" | "start" | "stop"

const TRANSITIONS: Record<LifecycleEvent, Record<LifecycleState, LifecycleState>> = {
  init: {
    created: "initializing",
    initializing: "initializing",
    ready: "ready",
    stopping: "stopping",
    stopped: "stopped",
    errored: "errored",
  },
  start: {
    created: "ready",
    initializing: "ready",
    ready: "ready",
    stopping: "stopping",
    stopped: "stopped",
    errored: "errored",
  },
  stop: {
    created: "stopped",
    initializing: "stopping",
    ready: "stopping",
    stopping: "stopping",
    stopped: "stopped",
    errored: "errored",
  },
}

export function transitionState(
  current: LifecycleState,
  event: LifecycleEvent,
): LifecycleState {
  return TRANSITIONS[event][current]
}

export function isValidTransition(
  current: LifecycleState,
  event: LifecycleEvent,
): boolean {
  const next = TRANSITIONS[event][current]
  return next !== current || current === getInitialTarget(event, current)
}

function getInitialTarget(
  event: LifecycleEvent,
  current: LifecycleState,
): LifecycleState | undefined {
  switch (event) {
    case "init":
      return current === "created" ? "initializing" : undefined
    case "start":
      return current === "created" || current === "initializing"
        ? "ready"
        : undefined
    case "stop":
      return current !== "stopped" && current !== "stopping" ? "stopping" : undefined
  }
}

export type LifecycleHandler = () => void | Promise<void>
