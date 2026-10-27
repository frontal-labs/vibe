import type { AgentEvent } from "./types"

/**
 * Plugin-facing hook names for the agent lifecycle. The loop emits `AgentEvent`s
 * (see `stream()` / `RunOptions.onEvent`); a host that wires `@vibe/plugin` maps
 * these names to those events. Kept as a stable contract so the plugin bridge and
 * the loop agree on vocabulary.
 */
export const AGENT_HOOKS = {
  iteration: "agent:iteration",
  toolCall: "agent:tool-call",
  toolResult: "agent:tool-result",
  done: "agent:done",
} as const

export type AgentHookName = (typeof AGENT_HOOKS)[keyof typeof AGENT_HOOKS]

/** Map an `AgentEvent` to its plugin hook name, or `undefined` for text/thinking deltas. */
export function hookFor(event: AgentEvent): AgentHookName | undefined {
  switch (event.type) {
    case "iteration":
      return AGENT_HOOKS.iteration
    case "toolCall":
      return AGENT_HOOKS.toolCall
    case "toolResult":
      return AGENT_HOOKS.toolResult
    case "done":
      return AGENT_HOOKS.done
    default:
      return undefined
  }
}
