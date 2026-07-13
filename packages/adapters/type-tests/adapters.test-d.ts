import type { Agent } from "@vibe/agent"
import { expectAssignable, expectType } from "tsd"

import { type AgentLike, toFetchHandler, toNodeListener } from "../src/index"

declare const agent: Agent
expectAssignable<AgentLike>(agent)

const fetchHandler = toFetchHandler(agent)
expectType<Promise<Response>>(fetchHandler(new Request("http://x", { method: "POST" })))

// Node listener is a (req, res) => Promise<void>
const nodeListener = toNodeListener(agent)
expectAssignable<(...args: never[]) => Promise<void>>(nodeListener)
