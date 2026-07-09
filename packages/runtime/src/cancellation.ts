import { cancelledError } from "@vibe/errors"

import type { CancellationToken, CancellationTokenSource } from "./types"

export function createCancellationTokenSource(): CancellationTokenSource {
  const controller = new AbortController()
  const listeners = new Set<() => void>()

  function onCancelled(listener: () => void): () => void {
    listeners.add(listener)
    if (controller.signal.aborted) {
      listener()
    }
    return () => {
      listeners.delete(listener)
    }
  }

  const token: CancellationToken = {
    get cancelled() {
      return controller.signal.aborted
    },
    get reason() {
      if (!controller.signal.aborted) return undefined
      const reason = controller.signal.reason
      return typeof reason === "string" ? reason : "Execution cancelled"
    },
    onCancelled,
    throwIfCancelled() {
      if (controller.signal.aborted) {
        const reason =
          typeof controller.signal.reason === "string"
            ? controller.signal.reason
            : "Execution cancelled"
        throw cancelledError(reason)
      }
    },
  }

  return {
    token,
    cancel(reason?: string) {
      if (controller.signal.aborted) return
      controller.abort(reason ?? "Execution cancelled")
      for (const listener of listeners) {
        listener()
      }
      listeners.clear()
    },
  }
}
