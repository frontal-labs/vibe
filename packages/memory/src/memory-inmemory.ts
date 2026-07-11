import type { Message } from "@vibe/model"

import type { Memory } from "./types"

/** The default `Memory` backend: an in-process map, cloned on every read/write. */
export function createInMemoryMemory(): Memory {
  const store = new Map<string, Message[]>()

  return {
    async load(id) {
      return (store.get(id) ?? []).map((m) => ({ ...m }))
    },
    async save(id, messages) {
      store.set(
        id,
        messages.map((m) => ({ ...m })),
      )
    },
    async append(id, message) {
      const existing = store.get(id) ?? []
      existing.push({ ...message })
      store.set(id, existing)
    },
    async clear(id) {
      store.delete(id)
    },
  }
}
