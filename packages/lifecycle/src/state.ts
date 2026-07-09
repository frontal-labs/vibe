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

export function transitionState(current: LifecycleState, event: LifecycleEvent): LifecycleState {
  return TRANSITIONS[event][current]
}

export function isValidTransition(current: LifecycleState, event: LifecycleEvent): boolean {
  const next = TRANSITIONS[event][current]
  if (next !== current) return true
  // Idempotent: calling start when already ready, or stop when already stopped
  return (event === "start" && current === "ready") || (event === "stop" && current === "stopped")
}

export type LifecycleHandler = () => void | Promise<void>
