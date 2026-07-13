import { afterEach, describe, expect, it } from "vitest"

import { anthropic, fake, openai } from "../src/adapters"

describe("provider adapters", () => {
  it("openai() returns an openai provider", () => {
    expect(openai({ apiKey: "k" }).id).toBe("openai")
  })

  it("anthropic() returns an anthropic provider", () => {
    expect(anthropic().id).toBe("anthropic")
  })

  it("fake() returns a scripted fake provider", async () => {
    const provider = fake([{ content: [{ type: "text", text: "hi" }] }])
    expect(provider.id).toBe("fake")
    const res = await provider.generate({ model: "fake", messages: [] })
    expect(res.content).toEqual([{ type: "text", text: "hi" }])
  })
})

describe("openai() env fallback", () => {
  const prev = process.env.OPENAI_API_KEY
  afterEach(() => {
    if (prev === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = prev
  })

  it("reads OPENAI_API_KEY from env when apiKey is omitted", async () => {
    process.env.OPENAI_API_KEY = "sk-env"
    let auth: string | undefined
    const provider = openai({
      fetch: async (_url, init) => {
        auth = init.headers.authorization
        return new Response(
          JSON.stringify({
            model: "gpt-4o",
            choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          }),
        )
      },
    })
    await provider.generate({ model: "gpt-4o", messages: [{ role: "user", content: "hi" }] })
    expect(auth).toBe("Bearer sk-env")
  })
})
