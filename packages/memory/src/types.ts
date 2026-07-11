import type { Message } from "@vibe/model"

export type { Message }

/** An append-only transcript with an immutable snapshot. */
export interface Conversation {
  /** The system prompt for the run, if any. */
  readonly system: string | undefined
  append(message: Message): void
  appendMany(messages: readonly Message[]): void
  /** A defensive copy of the transcript — safe to keep and mutate. */
  snapshot(): Message[]
  /** Number of messages appended so far. */
  size(): number
}

/** A persistence backend for conversations, keyed by id. */
export interface Memory {
  load(conversationId: string): Promise<Message[]>
  save(conversationId: string, messages: readonly Message[]): Promise<void>
  append(conversationId: string, message: Message): Promise<void>
  clear(conversationId: string): Promise<void>
}
