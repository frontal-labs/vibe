import type { WorkflowState } from "./types"

/**
 * Where workflow checkpoints live. The in-memory default is enough for a single
 * process; swap in a durable implementation (Redis, Postgres, a KV) for
 * cross-restart resume — the executor only depends on this interface.
 */
export interface CheckpointStore {
  save(state: WorkflowState): Promise<void>
  load(runId: string): Promise<WorkflowState | undefined>
  clear(runId: string): Promise<void>
}

/** An in-process checkpoint store (a snapshot per run id). */
export function createMemoryCheckpointStore(): CheckpointStore {
  const states = new Map<string, WorkflowState>()
  const copy = (state: WorkflowState): WorkflowState => ({
    ...state,
    outputs: { ...state.outputs },
    completed: [...state.completed],
  })
  return {
    save: (state) => {
      // Store a defensive copy so later mutation of the live state can't corrupt it.
      states.set(state.runId, copy(state))
      return Promise.resolve()
    },
    load: (runId) => {
      const state = states.get(runId)
      return Promise.resolve(state ? copy(state) : undefined)
    },
    clear: (runId) => {
      states.delete(runId)
      return Promise.resolve()
    },
  }
}
