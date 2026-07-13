import { defineTool, runToolCall } from "@vibe/tools"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { createContentGuard } from "../src/guardrails"
import { redactPII } from "../src/pii"
import { createRateLimiter } from "../src/rate-limit"
import { createMemorySecrets } from "../src/secrets"
import { secureTool } from "../src/secure-tool"

const echo = defineTool({
  name: "echo",
  description: "echo",
  schema: z.object({ text: z.string() }),
  execute: ({ text }) => text,
})

describe("secureTool", () => {
  it("redacts PII from the output", async () => {
    const secured = secureTool(echo, { redact: (t) => redactPII(t).text })
    const result = await runToolCall(secured, { text: "reach me at a@b.com" })
    expect(result.content).toContain("[REDACTED:email]")
    expect(result.content).not.toContain("a@b.com")
  })

  it("blocks flagged input via the content guard", async () => {
    const secured = secureTool(echo, { guard: createContentGuard({ blocked: ["secretword"] }) })
    const result = await runToolCall(secured, { text: "the secretword is here" })
    expect(result.isError).toBe(true)
    expect(result.content).toContain("Blocked input")
  })

  it("enforces the rate limit", async () => {
    const secured = secureTool(echo, {
      rateLimiter: createRateLimiter({ limit: 1, windowMs: 1000 }),
    })
    expect((await runToolCall(secured, { text: "one" })).content).toBe("one")
    const second = await runToolCall(secured, { text: "two" })
    expect(second.isError).toBe(true)
    expect(second.content).toContain("Rate limit exceeded")
  })

  it("exposes secrets to the handler via ctx.secrets", async () => {
    const readsSecret = defineTool({
      name: "reads_secret",
      description: "d",
      schema: z.object({}),
      execute: async (_input, ctx) => (await ctx.secrets?.get("API_KEY")) ?? "none",
    })
    const secured = secureTool(readsSecret, { secrets: createMemorySecrets({ API_KEY: "sk-1" }) })
    const result = await runToolCall(secured, {})
    expect(result.content).toBe("sk-1")
  })

  it("redacts PII from a thrown error message", async () => {
    const throws = defineTool({
      name: "throws",
      description: "d",
      schema: z.object({}),
      execute: () => {
        throw new Error("failed for a@b.com")
      },
    })
    const secured = secureTool(throws, { redact: (t) => redactPII(t).text })
    const result = await runToolCall(secured, {})
    expect(result.isError).toBe(true)
    expect(result.content).toContain("[REDACTED:email]")
  })
})
