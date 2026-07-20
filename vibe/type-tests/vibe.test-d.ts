import { expectAssignable, expectType } from "tsd"

import type { Agent } from "../src/agent"
import { createAgent, DEFAULT_MODEL } from "../src/index"
import { defineTool } from "../src/tools"

// Root barrel re-exports the common entry points.
expectType<"claude-opus-4-8">(DEFAULT_MODEL)
expectAssignable<(...args: never[]) => unknown>(createAgent)

// Subpath re-exports resolve to the underlying package.
expectAssignable<(...args: never[]) => unknown>(defineTool)
// The `vibe/agent` subpath surfaces the Agent type.
expectAssignable<Agent["run"]>((_input: { text: string }) => Promise.resolve({}) as never)
