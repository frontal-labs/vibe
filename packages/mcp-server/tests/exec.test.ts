import { expect, test } from "vitest"
import { exec } from "../src/lib/exec"

test("exec captures stdout and exit code", async () => {
  const result = await exec("echo", ["vibe"], { cwd: process.cwd() })
  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("vibe")
})
