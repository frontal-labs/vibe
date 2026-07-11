import type { Message, ModelRequest } from "@vibe/model"
import { expectAssignable, expectType } from "tsd"

import {
  type Conversation,
  type Memory,
  buildRequest,
  createConversation,
  createInMemoryMemory,
} from "../src/index"

const convo = createConversation({ system: "s" })
expectAssignable<Conversation>(convo)
expectType<Message[]>(convo.snapshot())

expectType<ModelRequest>(buildRequest({ model: "claude-opus-4-8", conversation: convo }))

const mem = createInMemoryMemory()
expectAssignable<Memory>(mem)
expectType<Promise<Message[]>>(mem.load("id"))
