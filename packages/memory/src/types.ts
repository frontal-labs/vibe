import type { Message, TokenUsage } from "vibe/model"

export type { Message }

/** An append-only transcript with an immutable snapshot. */
export interface Conversation {
  /** The system prompt for the run, if any. */
  readonly system: string | undefined
  append(message: Message): void
  appendMany(messages: readonly Message[]): void
  /** A defensive copy of the transcript — safe to keep and mutate. */
  snapshot(): Message[]
  /** Replace the whole transcript (used by summarizing compaction). */
  replace(messages: readonly Message[]): void
  /** Number of messages appended so far. */
  size(): number
}

/** The state needed to resume a run after a crash or restart. */
export interface RunCheckpoint {
  /** The transcript as of the last completed iteration. */
  readonly messages: readonly Message[]
  /** Model round-trips completed so far. */
  readonly iteration: number
  /** Token usage accumulated so far. */
  readonly usage: TokenUsage
}

/** Durable storage for run checkpoints, keyed by run id. */
export interface CheckpointStore {
  load(runId: string): Promise<RunCheckpoint | undefined>
  save(runId: string, checkpoint: RunCheckpoint): Promise<void>
  clear(runId: string): Promise<void>
}

/** A persistence backend for conversations, keyed by id. */
export interface Memory {
  load(conversationId: string): Promise<Message[]>
  save(conversationId: string, messages: readonly Message[]): Promise<void>
  append(conversationId: string, message: Message): Promise<void>
  clear(conversationId: string): Promise<void>
}
