import type { CheckpointStore, RunCheckpoint } from "./types"

/**
 * An in-process `CheckpointStore`. Checkpoints survive only as long as the process,
 * so use it for tests and single-process resumption; back the interface with a
 * database or object store when runs must survive a restart.
 */
export function createInMemoryCheckpointStore(): CheckpointStore {
  const store = new Map<string, RunCheckpoint>()

  return {
    // biome-ignore lint/suspicious/useAwait: interface requires Promise return
    async load(runId) {
      const checkpoint = store.get(runId)
      return checkpoint && structuredClone(checkpoint)
    },
    // biome-ignore lint/suspicious/useAwait: interface requires Promise return
    async save(runId, checkpoint) {
      store.set(runId, structuredClone(checkpoint))
    },
    // biome-ignore lint/suspicious/useAwait: interface requires Promise return
    async clear(runId) {
      store.delete(runId)
    },
  }
}
