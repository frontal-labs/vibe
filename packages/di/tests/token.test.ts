import { describe, expect, it } from "vitest"

import { createToken } from "../src/token"

describe("createToken", () => {
  it("should create a unique token each time", () => {
    const a = createToken<string>("svc")
    const b = createToken<string>("svc")
    expect(a).not.toBe(b)
  })

  it("should include the name in the string representation", () => {
    const token = createToken<number>("my-service")
    const key = token as unknown as string
    expect(key).toContain("my-service")
  })

  it("should be usable as a Map key", () => {
    const token = createToken<string>("map-test")
    const map = new Map<unknown, string>()
    map.set(token, "value")
    expect(map.get(token)).toBe("value")
  })
})
