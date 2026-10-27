import { expectType } from "tsd"
import type { AgentHookPayloads } from "vibe/agent"
import type { PluginHooks } from "vibe/plugin"

// A plugin author imports only the public types. Importing `vibe/agent` is enough for the agent
// hook payloads to be declared on `vibe/plugin`, so `on("agent:…")` handlers are typed.
declare const hooks: PluginHooks

hooks.on("agent:done", (payload) => {
  expectType<string>(payload.text)
  expectType<number>(payload.iterations)
  expectType<string>(payload.stopReason)
  // @ts-expect-error: a field the payload does not declare must not compile
  payload.nonexistent
})

hooks.on("agent:tool-call", (payload) => {
  expectType<string>(payload.id)
  expectType<string>(payload.name)
  expectType<unknown>(payload.input)
})

hooks.on("agent:tool-result", (payload) => {
  expectType<boolean>(payload.isError)
})

hooks.on("agent:iteration", (payload) => {
  expectType<number>(payload.iteration)
})

// The exported payload map agrees with the handler-side types above: a complete `agent:done`
// payload is accepted, and one missing a required field is rejected.
expectType<AgentHookPayloads["agent:done"]>({
  text: "",
  iterations: 1,
  stopReason: "end_turn",
  usage: { inputTokens: 0, outputTokens: 0 },
})
// @ts-expect-error: `iterations` is required
expectType<AgentHookPayloads["agent:done"]>({
  text: "",
  stopReason: "end_turn",
  usage: { inputTokens: 0, outputTokens: 0 },
})

// Exact identity: the handler's payload text is exactly `string`, not a literal or a supertype.
hooks.on("agent:done", (payload) => {
  identical<string>()(payload.text)
  // @ts-expect-error: `number` is not identical to the `text` type
  identical<number>()(payload.text)
})
