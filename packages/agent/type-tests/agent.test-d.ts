import { createFakeProvider } from "@vibe/model"
import { expectAssignable, expectType } from "tsd"

import { type Agent, type AgentEvent, type AgentResult, createAgent } from "../src/index"

const provider = createFakeProvider([{ content: [{ type: "text", text: "x" }] }])
const agent = createAgent({ provider })

expectAssignable<Agent>(agent)
expectType<Promise<AgentResult>>(agent.run("hi"))
expectType<AsyncGenerator<AgentEvent, AgentResult>>(agent.stream("hi"))
