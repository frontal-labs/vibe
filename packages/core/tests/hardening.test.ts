import { denyTools } from "vibe/governance"
import { createFakeProvider, type ModelProvider } from "vibe/model"
import { defineTool } from "vibe/tools"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { vibe } from "../src/vibe"

const echo = defineTool({
  name: "echo",
  description: "echoes its input",
  schema: z.object({ value: z.string() }),
  execute: (input) => `echoed: ${input.value}`,
})

/** One tool call, then a final answer. */
function callThenAnswer(): ModelProvider {
  return createFakeProvider([
    { content: [{ type: "toolUse", id: "c1", name: "echo", input: { value: "hi" } }] },
    { content: [{ type: "text", text: "done" }] },
  ])
}

describe("system governance", () => {
  it("enforces the configured policies on system agents by default", async () => {
    const system = vibe.system({
      name: "gov",
      provider: callThenAnswer(),
      tools: [echo],
      governance: { policies: [denyTools(["echo"])] },
    })
    const result = await system.agent().run("go")
    expect(result.transcript[2]?.content).toEqual([
      expect.objectContaining({ isError: true, content: 'Denied by "denylist"' }),
    ])
  })

  it("can be opted out with governance.enforce = false", async () => {
    const system = vibe.system({
      name: "no-gov",
      provider: callThenAnswer(),
      tools: [echo],
      governance: { policies: [denyTools(["echo"])], enforce: false },
    })
    const result = await system.agent().run("go")
    expect(result.transcript[2]?.content).toEqual([
      expect.objectContaining({ isError: false, content: expect.stringContaining("echoed: hi") }),
    ])
  })
})

describe("system tracing", () => {
  it("routes ask() through the tracer when tracing is enabled", async () => {
    const system = vibe.system({
      name: "traced",
      provider: createFakeProvider([{ content: [{ type: "text", text: "traced answer" }] }]),
      observability: { tracing: true },
    })
    await expect(system.ask("hello")).resolves.toBe("traced answer")
  })
})

describe("system durability", () => {
  it("continues a conversation across ask() calls and survives a new system over the same store", async () => {
    const { createFileMemory } = await import("vibe/memory")
    const { mkdtemp, rm } = await import("node:fs/promises")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")
    const dir = await mkdtemp(join(tmpdir(), "vibe-sys-"))
    try {
      const turns = (text: string) => createFakeProvider([{ content: [{ type: "text", text }] }])
      const first = vibe.system({
        name: "a",
        provider: turns("one"),
        memory: createFileMemory({ dir }),
      })
      await first.ask("hello", { conversationId: "chat" })

      // A brand-new system process, same directory: the conversation is still there.
      const second = vibe.system({
        name: "b",
        provider: turns("two"),
        memory: createFileMemory({ dir }),
      })
      await expect(second.ask("again", { conversationId: "chat" })).resolves.toBe("two")
      const saved = await createFileMemory({ dir }).load("chat")
      expect(saved).toHaveLength(4)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("rejects a runId when no checkpointStore is configured", async () => {
    const system = vibe.system({
      name: "no-store",
      provider: createFakeProvider([{ content: [{ type: "text", text: "x" }] }]),
    })
    await expect(system.ask("hi", { runId: "r1" })).rejects.toThrow("checkpointStore")
  })

  it("resumes an ask() run from its checkpoint", async () => {
    const { createInMemoryCheckpointStore } = await import("vibe/memory")
    const store = createInMemoryCheckpointStore()
    await store.save("job-1", {
      messages: [
        { role: "user", content: "long task" },
        { role: "assistant", content: [{ type: "text", text: "partial" }] },
      ],
      iteration: 1,
      usage: { inputTokens: 0, outputTokens: 0 },
    })
    const provider = createFakeProvider([{ content: [{ type: "text", text: "finished" }] }])
    const system = vibe.system({ name: "resume", provider, checkpointStore: store })
    await expect(system.ask("long task", { runId: "job-1" })).resolves.toBe("finished")
    expect(await store.load("job-1")).toBeUndefined()
  })
})

describe("system OTLP export", () => {
  it("exports the run's spans to the collector on stop, under one trace id", async () => {
    const posts: Array<{ url: string; body: unknown }> = []
    const original = globalThis.fetch
    // biome-ignore lint/suspicious/useAwait: interface requires Promise return
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      posts.push({ url: String(url), body: JSON.parse(String(init.body)) })
      return new Response("", { status: 200 })
    }) as typeof fetch
    try {
      const system = vibe.system({
        name: "otel",
        provider: createFakeProvider([{ content: [{ type: "text", text: "ok" }] }]),
        observability: { otlp: { endpoint: "http://collector:4318", serviceName: "billing" } },
      })
      await system.ask("trace me")
      await system.stop()

      expect(posts).toHaveLength(1)
      expect(posts[0]?.url).toBe("http://collector:4318/v1/traces")
      type OTLPBody = {
        resourceSpans: Array<{
          scopeSpans: Array<{ spans: Array<{ traceId: string; name: string }> }>
        }>
      }
      const body = posts[0]?.body as OTLPBody
      const spans = body.resourceSpans[0]?.scopeSpans[0]?.spans ?? []
      expect(spans.map((s) => s.name)).toContain("agent.run")
      expect(new Set(spans.map((s) => s.traceId)).size).toBe(1)
    } finally {
      globalThis.fetch = original
    }
  })
})

describe("plugin hooks from agent runs", () => {
  it("delivers typed agent hooks to plugins registered on the system", async () => {
    const done: string[] = []
    const calls: string[] = []
    const plugin = {
      name: "audit",
      version: "1.0.0",
      manifest: { name: "audit", version: "1.0.0", description: "records agent activity" },
      setup(hooks: import("vibe/plugin").PluginHooks) {
        hooks.on("agent:tool-call", (payload) => {
          calls.push(payload.name)
        })
        hooks.on("agent:done", (payload) => {
          done.push(payload.text)
        })
      },
    }
    const system = vibe.system({
      name: "plugged",
      provider: createFakeProvider([
        { content: [{ type: "toolUse", id: "c1", name: "echo", input: { value: "hi" } }] },
        { content: [{ type: "text", text: "all good" }] },
      ]),
      tools: [echo],
      plugins: [plugin],
    })
    await system.start()
    await system.ask("go")
    await system.stop()
    expect(calls).toEqual(["echo"])
    expect(done).toEqual(["all good"])
  })
})
