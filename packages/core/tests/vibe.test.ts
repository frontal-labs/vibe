import { describe, it, expect } from "vitest"

import { vibe } from "../src/vibe"

describe("vibe singleton", () => {
  it("should create a system via vibe.system()", () => {
    const system = vibe.system({ name: "my-app" })
    expect(system.name).toBe("my-app")
  })

  it("should create independent systems", () => {
    const a = vibe.system({ name: "system-a" })
    const b = vibe.system({ name: "system-b" })
    expect(a.name).toBe("system-a")
    expect(b.name).toBe("system-b")
  })
})
