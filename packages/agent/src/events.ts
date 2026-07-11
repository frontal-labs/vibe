import type { AgentEvent, AgentResult } from "./types"

/**
 * Drive a run generator to completion, forwarding each event to `onEvent`, and
 * return the generator's final `AgentResult`. This is what `run()` uses to turn
 * the shared streaming loop into a single awaited result.
 */
export async function drain(
  gen: AsyncGenerator<AgentEvent, AgentResult>,
  onEvent?: (event: AgentEvent) => void,
): Promise<AgentResult> {
  let next = await gen.next()
  while (!next.done) {
    onEvent?.(next.value)
    next = await gen.next()
  }
  return next.value
}
