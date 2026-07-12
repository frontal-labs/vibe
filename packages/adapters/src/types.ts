import type { Agent } from "@vibe/agent"

/** The minimal surface an adapter needs: run to completion, or stream events. */
export type AgentLike = Pick<Agent, "run" | "stream">

export interface HttpAdapterOptions {
  /** Restrict to a path (exact match); omit to accept any path. */
  readonly path?: string
}

/** The JSON body an adapter accepts: `{ prompt }` (or `{ text }`), optional `stream`. */
export interface AskRequestBody {
  readonly prompt?: string
  readonly text?: string
  readonly stream?: boolean
}
