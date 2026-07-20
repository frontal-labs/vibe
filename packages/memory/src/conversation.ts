import type { Message } from "vibe/model"

import type { Conversation } from "./types"

export interface ConversationOptions {
  system?: string
  messages?: readonly Message[]
}

/** Create an in-process, append-only conversation transcript. */
export function createConversation(options: ConversationOptions = {}): Conversation {
  const messages: Message[] = options.messages ? [...options.messages] : []

  return {
    system: options.system,
    append(message) {
      messages.push(message)
    },
    appendMany(next) {
      for (const message of next) messages.push(message)
    },
    snapshot: () => messages.map((m) => ({ ...m })),
    size: () => messages.length,
  }
}
