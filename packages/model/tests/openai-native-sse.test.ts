import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { resetNativeAddonCache } from "@vibe/shared"
import { describe, expect, it } from "vitest"

import { createOpenAIProvider } from "../src/openai/provider"
import type { ModelStreamEvent } from "../src/types"

const here = dirname(fileURLToPath(import.meta.url))

/** Locate a locally-built addon (`.node` preferred). Returns null if none was built. */
function findAddon(): string | null {
  for (const name of ["vibe_napi.node", "libvibe_napi.dylib"]) {
    const path = join(here, "..", "..", "..", "target", "release", name)
    if (existsSync(path)) return path
  }
  return null
}

// A streamed reply with text deltas and a piecewise tool call, terminated by [DONE].
const SSE_BODY = [
  '{"model":"gpt-4o","choices":[{"delta":{"content":"Hel"}}]}',
  '{"choices":[{"delta":{"content":"lo"}}]}',
  '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_order","arguments":"{\\"id\\":"}}]}}]}',
  '{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"A-1\\"}"}}]}}]}',
  '{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
  "[DONE]",
]
  .map((frame) => `data: ${frame}`)
  .join("\n\n")

function providerWith(nativeSse: boolean) {
  return createOpenAIProvider({
    apiKey: "test",
    nativeSse,
    fetch: async () => new Response(SSE_BODY, { status: 200 }),
  })
}

async function collect(events: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> {
  const out: ModelStreamEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

describe("OpenAI native SSE fold", () => {
  it("produces the same events as the TS accumulator (parity)", async () => {
    const addon = findAddon()
    // Point the loader at the built addon so `nativeSse` actually folds in Rust. When no addon is
    // built (typical CI without the release step), the native path falls back to the TS accumulator
    // and this remains a same-output check — never a false failure.
    const prev = process.env.VIBE_NATIVE_ADDON
    if (addon) process.env.VIBE_NATIVE_ADDON = addon
    resetNativeAddonCache()

    try {
      const tsEvents = await collect(providerWith(false).stream({ model: "gpt-4o", messages: [] }))
      const nativeEvents = await collect(
        providerWith(true).stream({ model: "gpt-4o", messages: [] }),
      )
      expect(nativeEvents).toEqual(tsEvents)

      // And the folded content is correct regardless of path.
      const done = nativeEvents.at(-1)
      expect(done?.type).toBe("done")
      if (done?.type === "done") {
        expect(done.response.stopReason).toBe("tool_use")
        expect(done.response.content).toContainEqual({ type: "text", text: "Hello" })
        expect(done.response.content).toContainEqual({
          type: "toolUse",
          id: "call_1",
          name: "get_order",
          input: { id: "A-1" },
        })
      }
    } finally {
      process.env.VIBE_NATIVE_ADDON = prev
      resetNativeAddonCache()
    }
  })
})
