import type { TokenUsage } from "vibe/model"
import type { HookPayloadMap } from "vibe/plugin"
import type { AgentEvent } from "./types"

/**
 * Plugin-facing hook names for the agent lifecycle. The loop emits each hook at its point in the run
 * (see `AgentHookEmitter`), and a host that wires `vibe/plugin` delivers them to registered plugins.
 */
export const AGENT_HOOKS = {
  iteration: "agent:iteration",
  toolCall: "agent:tool-call",
  toolResult: "agent:tool-result",
  done: "agent:done",
} as const

export type AgentHookName = (typeof AGENT_HOOKS)[keyof typeof AGENT_HOOKS]

/** Payload of `agent:iteration`: a model round-trip is about to start. */
export interface AgentIterationPayload {
  iteration: number
  conversationId?: string
}

/** Payload of `agent:tool-call`: a tool call has been requested, before governance runs. */
export interface AgentToolCallPayload {
  id: string
  name: string
  input: unknown
  actor?: string
}

/** Payload of `agent:tool-result`: the tool call finished (or was refused). */
export interface AgentToolResultPayload {
  id: string
  name: string
  content: string
  isError: boolean
}

/** Payload of `agent:done`: the run finished. */
export interface AgentDonePayload {
  text: string
  iterations: number
  stopReason: string
  usage: TokenUsage
}

/** Maps each agent hook name to its payload, so `on("agent:done", …)` is typed. */
declare module "vibe/plugin" {
  interface HookPayloadMap {
    "agent:iteration": AgentIterationPayload
    "agent:tool-call": AgentToolCallPayload
    "agent:tool-result": AgentToolResultPayload
    "agent:done": AgentDonePayload
  }
}

/** The payload of every agent hook, keyed by hook name. */
export type AgentHookPayloads = { [K in AgentHookName]: HookPayloadMap[K] }

/**
 * Delivers one agent hook. The loop awaits it, so a plugin handler that throws fails the run that
 * triggered it. Hosts that do not use plugins can omit the emitter.
 */
export type AgentHookEmitter = (name: AgentHookName, payload: unknown) => Promise<void>

/** Hook names for the events a plugin can see. Text and thinking deltas are not hooks. */
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
