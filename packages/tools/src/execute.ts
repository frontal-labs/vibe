import { cancelledError } from "vibe/errors"
import { isError as isErrorValue } from "vibe/shared"

import type { AnyTool, ToolContext, ToolResult } from "./types"

export interface RunToolOptions {
  /** Wall-clock budget for the handler; a timeout yields an `isError` result. */
  timeoutMs?: number
}

/**
 * Validate `input` against the tool's schema, then run its handler under a
 * timeout and the run's cancellation token. A handler that throws (or a timeout,
 * or invalid input) becomes `{ isError: true, content }` — surfaced to the model,
 * never thrown — so the agent loop can let the model recover. Genuine
 * cancellation is the one exception: it rejects, unwinding the whole run.
 */
export async function runToolCall(
  tool: AnyTool,
  input: unknown,
  ctx: ToolContext = {},
  options: RunToolOptions = {},
): Promise<ToolResult> {
  ctx.cancellationToken?.throwIfCancelled()

  // Validate via the Standard Schema interface, so any validator (Zod/Valibot/
  // ArkType/…) works. `validate` may be sync or async.
  const result = await tool.schema["~standard"].validate(input)
  if (result.issues) {
    const message = result.issues.map((issue) => issue.message).join("; ")
    return { isError: true, content: `Invalid input for "${tool.name}": ${message}` }
  }

  try {
    const value = await withTimeout(
      Promise.resolve(tool.execute(result.value, ctx)),
      options.timeoutMs,
      ctx,
      tool.name,
    )
    return typeof value === "string" ? { content: value } : value
  } catch (error) {
    // A cancelled run must unwind — don't disguise it as a tool result.
    if (ctx.cancellationToken?.cancelled) throw error
    const message = isErrorValue(error) ? error.message : String(error)
    return { isError: true, content: message }
  }
}

function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number | undefined,
  ctx: ToolContext,
  toolName: string,
): Promise<T> {
  if (!(timeoutMs || ctx.cancellationToken)) return work

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      unsubscribe?.()
      fn()
    }

    const timer = timeoutMs
      ? setTimeout(
          () =>
            finish(() => reject(new Error(`Tool "${toolName}" timed out after ${timeoutMs}ms`))),
          timeoutMs,
        )
      : undefined

    const unsubscribe = ctx.cancellationToken?.onCancelled(() =>
      // Reject (don't `throwIfCancelled`) — the listener runs synchronously
      // inside `cancel()`, so a throw here would escape the caller's `cancel()`.
      finish(() => reject(cancelledError(`Tool "${toolName}" cancelled`))),
    )

    work.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    )
  })
}
