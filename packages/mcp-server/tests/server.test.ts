import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"

import { createLogger, LogLevel } from "@vibe/logger"
import { expect, test } from "vitest"

import { buildServer } from "../src/server"
import { Session } from "../src/session"

test("server exposes vibe.* tools and answers status", async () => {
  const logger = createLogger({ level: LogLevel.Error })
  const session = new Session(process.cwd(), logger)
  const server = await buildServer({ session, repoRoot: process.cwd(), logger })

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)

  const client = new Client({ name: "test", version: "0" }, { capabilities: {} })
  await client.connect(clientTransport)

  const { tools } = await client.listTools()
  const names = tools.map((t) => t.name)
  expect(names).toContain("vibe_runtime_status")
  expect(names).toContain("vibe_dev_info")
  expect(names).toContain("vibe_dev_engineer_run")

  const result = await client.callTool({ name: "vibe_runtime_status", arguments: {} })
  expect(result.isError).toBeFalsy()
  const block = result.content[0]
  if (block?.type !== "text") throw new Error("expected a text block")
  const parsed = JSON.parse(block.text) as { repoRoot?: string }
  expect(parsed.repoRoot).toBeDefined()

  await client.close()
  await server.close()
  await session.stop()
})
