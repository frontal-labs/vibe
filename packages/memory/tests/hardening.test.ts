import type { Message } from "vibe/model"
import { describe, expect, it } from "vitest"
import { createInMemoryCheckpointStore } from "../src/checkpoint-inmemory"
import { createConversation } from "../src/conversation"
import { buildRequest, estimateTokens, isCutPoint, nearestCutPoint } from "../src/request-builder"

const toolTurn = (id: string, value: string): Message[] => [
  { role: "assistant", content: [{ type: "toolUse", id, name: "fetch", input: { url: value } }] },
  { role: "user", content: [{ type: "toolResult", toolUseId: id, content: value }] },
]

describe("estimateTokens counts tool blocks by their text", () => {
  it("counts a large tool result instead of a flat per-block estimate", () => {
    const big = "z".repeat(4000)
    const tokens = estimateTokens([
      { role: "user", content: [{ type: "toolResult", toolUseId: "1", content: big }] },
    ])
    expect(tokens).toBeGreaterThanOrEqual(1000)
  })
})

describe("cut points", () => {
  it("never allows a cut in front of a tool result", () => {
    const [assistant, result] = toolTurn("1", "data")
    expect(isCutPoint(assistant as Message)).toBe(true)
    expect(isCutPoint(result as Message)).toBe(false)
    expect(isCutPoint({ role: "user", content: "plain" })).toBe(true)
  })

  it("moves a cut forward to the next valid point, else backward", () => {
    const messages: Message[] = [
      { role: "user", content: "a" },
      ...toolTurn("1", "x"),
      ...toolTurn("2", "y"),
    ]
    // index 2 is a tool result → forward to 3 (assistant of the next turn)
    expect(nearestCutPoint(messages, 2)).toBe(3)
    // trailing tool result with nothing after it → backward to its assistant turn
    expect(nearestCutPoint(messages, messages.length - 1)).toBe(messages.length - 2)
  })
})

describe("buildRequest compaction keeps tool pairs intact", () => {
  it("drops whole turns and never starts the window with an orphaned tool result", () => {
    const conversation = createConversation({ system: "sys" })
    conversation.append({ role: "user", content: "start" })
    for (let i = 0; i < 6; i++) conversation.appendMany(toolTurn(`t${i}`, "q".repeat(400)))

    const request = buildRequest({ model: "m", conversation, budget: 600 })
    const first = request.messages[0] as Message
    expect(isCutPoint(first)).toBe(true)
    expect(request.messages.length).toBeLessThan(13)
  })
})

describe("conversation.replace", () => {
  it("swaps the whole transcript", () => {
    const conversation = createConversation()
    conversation.append({ role: "user", content: "old" })
    conversation.replace([{ role: "user", content: "new" }])
    expect(conversation.snapshot()).toEqual([{ role: "user", content: "new" }])
    expect(conversation.size()).toBe(1)
  })
})

describe("in-memory checkpoint store", () => {
  it("round-trips a checkpoint and returns a copy", async () => {
    const store = createInMemoryCheckpointStore()
    const checkpoint = {
      messages: [{ role: "user" as const, content: "hi" }],
      iteration: 2,
      usage: { inputTokens: 5, outputTokens: 3 },
    }
    await store.save("run", checkpoint)
    const loaded = await store.load("run")
    expect(loaded).toEqual(checkpoint)
    expect(loaded).not.toBe(checkpoint)
    await store.clear("run")
    expect(await store.load("run")).toBeUndefined()
  })
})

describe("file store permissions", () => {
  it("creates an owner-only directory and owner-only files", async () => {
    const { mkdtemp, readdir, rm, stat } = await import("node:fs/promises")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const { createFileCheckpointStore, createFileMemory } = await import("../src/index")
    const root = await mkdtemp(join(tmpdir(), "vibe-perm-"))
    const dir = join(root, "store")
    try {
      await createFileMemory({ dir }).save("chat", [{ role: "user", content: "private" }])
      await createFileCheckpointStore({ dir }).save("run", {
        messages: [],
        iteration: 0,
        usage: { inputTokens: 0, outputTokens: 0 },
      })
      expect((await stat(dir)).mode & 0o777).toBe(0o700)
      const files = await readdir(dir)
      expect(files.length).toBe(2)
      for (const file of files) {
        expect((await stat(join(dir, file))).mode & 0o777).toBe(0o600)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
