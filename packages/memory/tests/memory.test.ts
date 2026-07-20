import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import type { Message } from "vibe/model"
import { resetNativeAddonCache } from "vibe/shared"
import { describe, expect, it } from "vitest"

import { createConversation } from "../src/conversation"
import { createInMemoryMemory } from "../src/memory-inmemory"
import { buildRequest, estimateTokens } from "../src/request-builder"

const user = (text: string): Message => ({ role: "user", content: text })
const assistant = (text: string): Message => ({ role: "assistant", content: text })

describe("createConversation", () => {
  it("appends and snapshots defensively", () => {
    const convo = createConversation({ system: "be nice" })
    convo.append(user("hi"))
    convo.appendMany([assistant("hello"), user("bye")])
    expect(convo.system).toBe("be nice")
    expect(convo.size()).toBe(3)

    const snap = convo.snapshot()
    snap.push(user("mutation"))
    snap[0].content = "changed"
    // original transcript is untouched
    expect(convo.size()).toBe(3)
    expect(convo.snapshot()[0].content).toBe("hi")
  })
})

describe("buildRequest", () => {
  it("carries system, tools, effort and messages", () => {
    const convo = createConversation({ system: "sys", messages: [user("q")] })
    const req = buildRequest({
      model: "claude-opus-4-8",
      conversation: convo,
      tools: [{ name: "t", inputSchema: { type: "object" } }],
      effort: "high",
    })
    expect(req.model).toBe("claude-opus-4-8")
    expect(req.system).toBe("sys")
    expect(req.tools).toHaveLength(1)
    expect(req.effort).toBe("high")
    expect(req.messages).toEqual([user("q")])
  })

  it("trims oldest messages to fit a token budget", () => {
    const convo = createConversation({
      messages: [user("a".repeat(400)), assistant("b".repeat(400)), user("recent")],
    })
    const req = buildRequest({
      model: "claude-opus-4-8",
      conversation: convo,
      budget: 50, // ~200 chars — only the last message survives
    })
    expect(req.messages.at(-1)).toEqual(user("recent"))
    expect(req.messages.length).toBeLessThan(3)
  })

  it("never trims below the last message", () => {
    const convo = createConversation({ messages: [user("x".repeat(10_000))] })
    const req = buildRequest({ model: "m", conversation: convo, budget: 1 })
    expect(req.messages).toHaveLength(1)
  })

  it("uses a custom token counter when provided", () => {
    const convo = createConversation({ messages: [user("a"), user("b"), user("c")] })
    const req = buildRequest({
      model: "m",
      conversation: convo,
      budget: 2,
      countTokens: (messages) => messages.length, // 1 token per message
    })
    expect(req.messages).toHaveLength(2)
  })

  it("counts each message once (O(n), not re-counted per dropped turn)", () => {
    const convo = createConversation({
      messages: [user("a"), user("b"), user("c"), user("d"), user("e")],
    })
    let calls = 0
    buildRequest({
      model: "m",
      conversation: convo,
      budget: 2,
      // Each single-message call returns 1; the old O(n²) loop would re-count the whole
      // remaining list on every drop, so this call count proves the single-pass path.
      countTokens: (messages) => {
        calls += 1
        return messages.length
      },
    })
    expect(calls).toBe(5) // exactly one count per message, no system prompt
  })

  it("middle-out keeps the first turn plus the most recent suffix", () => {
    const convo = createConversation({
      messages: [user("FIRST"), user("mid-1"), user("mid-2"), user("LAST")],
    })
    const req = buildRequest({
      model: "m",
      conversation: convo,
      budget: 2, // room for two 1-token turns
      compaction: "middle-out",
      countTokens: (messages) => messages.length,
    })
    expect(req.messages).toEqual([user("FIRST"), user("LAST")])
  })

  it("drop-oldest (default) keeps only the most recent suffix", () => {
    const convo = createConversation({
      messages: [user("FIRST"), user("mid"), user("LAST")],
    })
    const req = buildRequest({
      model: "m",
      conversation: convo,
      budget: 2,
      countTokens: (messages) => messages.length,
    })
    expect(req.messages).toEqual([user("mid"), user("LAST")])
  })
})

describe("estimateTokens", () => {
  it("counts system + content chars at ~4 chars/token", () => {
    expect(estimateTokens([user("12345678")], "1234")).toBe(3) // (8 + 4) / 4
  })
})

describe("native token counting (when the addon is built)", () => {
  function findAddon(): string | null {
    const here = dirname(fileURLToPath(import.meta.url))
    for (const name of ["vibe_napi.node", "libvibe_napi.dylib"]) {
      const path = join(here, "..", "..", "..", "target", "release", name)
      if (existsSync(path)) return path
    }
    return null
  }

  it("trims a long transcript to budget via the native BPE counter", () => {
    const addon = findAddon()
    if (!addon) return // no addon in this env; the char-heuristic path is covered above

    const prev = process.env.VIBE_NATIVE_ADDON
    process.env.VIBE_NATIVE_ADDON = addon
    resetNativeAddonCache()
    try {
      const convo = createConversation({
        messages: [
          user("first ".repeat(200)),
          assistant("second ".repeat(200)),
          user("the newest turn"),
        ],
      })
      const req = buildRequest({
        model: "gpt-4o",
        conversation: convo,
        budget: 20, // only the short recent turn fits under a real BPE count
        tokenFamily: "openai",
      })
      expect(req.messages.at(-1)).toEqual(user("the newest turn"))
      expect(req.messages.length).toBeLessThan(3)
    } finally {
      process.env.VIBE_NATIVE_ADDON = prev
      resetNativeAddonCache()
    }
  })
})

describe("createInMemoryMemory", () => {
  it("round-trips a conversation and isolates snapshots", async () => {
    const mem = createInMemoryMemory()
    await mem.save("c1", [user("hi")])
    await mem.append("c1", assistant("hello"))
    const loaded = await mem.load("c1")
    expect(loaded).toEqual([user("hi"), assistant("hello")])

    loaded.push(user("mutation"))
    expect(await mem.load("c1")).toHaveLength(2) // store is not aliased

    await mem.clear("c1")
    expect(await mem.load("c1")).toEqual([])
  })
})
