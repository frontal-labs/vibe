import { expectAssignable, expectType } from "tsd"
import type { Message, ModelRequest } from "vibe/model"

import {
  buildRequest,
  type Conversation,
  createConversation,
  createInMemoryMemory,
  type Memory,
} from "../src/index"

const convo = createConversation({ system: "s" })
expectAssignable<Conversation>(convo)
expectType<Message[]>(convo.snapshot())

expectType<ModelRequest>(buildRequest({ model: "claude-opus-4-8", conversation: convo }))

const mem = createInMemoryMemory()
expectAssignable<Memory>(mem)
expectType<Promise<Message[]>>(mem.load("id"))
