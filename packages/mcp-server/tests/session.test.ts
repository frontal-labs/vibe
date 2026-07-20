import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createLogger, LogLevel } from "vibe/logger"
import { createFakeProvider } from "vibe/model"
import { expect, test } from "vitest"

import { Session } from "../src/session"

test("runAgent drives the loop with a fake provider (no network)", async () => {
  const root = mkdtempSync(join(tmpdir(), "vibe-"))
  const logger = createLogger({ level: LogLevel.Error })
  const provider = createFakeProvider([
    { content: [{ type: "text", text: "hello" }], stopReason: "end_turn" },
  ])
  const session = new Session(root, logger, provider)
  try {
    const result = await session.runAgent("hi")
    expect(result.text).toBe("hello")
    expect(result.stopReason).toBe("end_turn")
    expect(result.iterations).toBeGreaterThanOrEqual(1)
  } finally {
    await session.stop()
    rmSync(root, { force: true, recursive: true })
  }
})

test("built-in operator tools are seeded once", () => {
  const root = mkdtempSync(join(tmpdir(), "vibe-"))
  const session = new Session(root)
  try {
    session.registerBuiltinTools()
    session.registerBuiltinTools()
    const names = session.listTools().map((t) => t.name)
    expect(names).toContain("read_file")
    expect(names).toContain("list_dir")
    expect(names).toContain("run_command")
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})
