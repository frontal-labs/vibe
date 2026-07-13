import { createAgent } from "@vibe/agent"
import { createFakeProvider } from "@vibe/model"
import { describe, expect, it } from "vitest"

import { generateDockerfile, generateDockerignore } from "../src/dockerfile"
import { toCloudflareWorker, toLambdaHandler } from "../src/targets"

const agent = () =>
  createAgent({ provider: createFakeProvider([{ content: [{ type: "text", text: "hi" }] }]) })

describe("generateDockerfile", () => {
  it("emits a two-stage Bun build with the given port and entry", () => {
    const df = generateDockerfile({ port: 8080, entry: "server.js" })
    expect(df).toContain("FROM oven/bun:1-slim")
    expect(df).toContain("bun install --frozen-lockfile --production")
    expect(df).toContain("EXPOSE 8080")
    expect(df).toContain('CMD ["bun", "server.js"]')
  })
  it("emits env lines", () => {
    expect(generateDockerfile({ env: { LOG_LEVEL: "info" } })).toContain("ENV LOG_LEVEL=info")
  })
  it("dockerignore excludes node_modules and env", () => {
    const ignore = generateDockerignore()
    expect(ignore).toContain("node_modules")
    expect(ignore).toContain(".env*")
  })
})

describe("targets", () => {
  it("toCloudflareWorker exposes a fetch handler", async () => {
    const worker = toCloudflareWorker(agent())
    const res = await worker.fetch(
      new Request("https://x/", { method: "POST", body: JSON.stringify({ prompt: "hi" }) }),
    )
    expect(((await res.json()) as { text: string }).text).toBe("hi")
  })

  it("toLambdaHandler maps an APIGW v2 event to a result", async () => {
    const handler = toLambdaHandler(agent())
    const result = await handler({
      rawPath: "/",
      requestContext: { http: { method: "POST" } },
      body: JSON.stringify({ prompt: "hi" }),
    })
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toMatchObject({ text: "hi" })
  })

  it("decodes base64 lambda bodies", async () => {
    const handler = toLambdaHandler(agent())
    const result = await handler({
      rawPath: "/",
      requestContext: { http: { method: "POST" } },
      isBase64Encoded: true,
      body: Buffer.from(JSON.stringify({ prompt: "hi" })).toString("base64"),
    })
    expect(result.statusCode).toBe(200)
  })
})

import type { DeployManifest } from "../src/manifest"
import { deployPlan, generateHandler } from "../src/manifest"

const manifest: DeployManifest = {
  app: "shop",
  target: "cloudflare",
  agents: {
    support: { name: "support", entry: "support.js", bytes: 3072, tools: ["../tools/get-order"] },
    triage: { name: "triage", entry: "triage.js", bytes: 12_288, tools: [] },
  },
}

describe("deployPlan", () => {
  it("plans one handler per agent with cold-start sizes", () => {
    const plan = deployPlan(manifest)
    expect(plan.target).toBe("cloudflare")
    expect(plan.agents.map((a) => a.name)).toEqual(["support", "triage"])
    expect(plan.agents[0]?.coldStartKB).toBe(3)
    expect(plan.agents[0]?.handler).toContain("toCloudflareWorker")
  })

  it("flags agents over the cold-start budget", () => {
    const plan = deployPlan(manifest, { maxColdStartKB: 8 })
    expect(plan.withinBudget).toBe(false)
    expect(plan.agents.find((a) => a.name === "support")?.withinBudget).toBe(true)
    expect(plan.agents.find((a) => a.name === "triage")?.withinBudget).toBe(false)
  })

  it("generateHandler emits the right wrapper per target", () => {
    expect(generateHandler("a.js", "lambda")).toContain("toLambdaHandler")
    expect(generateHandler("a.js", "vercel")).toContain("toVercelHandler")
    expect(generateHandler("a.js", "node")).toContain("toNodeListener")
  })
})
