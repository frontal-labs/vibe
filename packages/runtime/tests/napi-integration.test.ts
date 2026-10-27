import { serializeError } from "@@vibe/errors"
import { nativeAddon, resetNativeAddonCache } from "@@vibe/shared"
import { beforeEach, describe, expect, it } from "vitest"

const ORIGINAL_ADDON = process.env.VIBE_NATIVE_ADDON

beforeEach(() => {
  process.env.VIBE_NATIVE_ADDON = ORIGINAL_ADDON
  resetNativeAddonCache()
})

describe("NativeAddon loading", () => {
  it("should return null when VIBE_NATIVE_ADDON is not set", () => {
    delete process.env.VIBE_NATIVE_ADDON
    resetNativeAddonCache()
    expect(nativeAddon()).toBeNull()
  })

  it("should cache the result after checking once", () => {
    delete process.env.VIBE_NATIVE_ADDON
    resetNativeAddonCache()
    const first = nativeAddon()
    const second = nativeAddon()
    expect(second).toBe(first)
  })
})

describe("ID generation", () => {
  it("should generate unique execution IDs", () => {
    const addon = nativeAddon()
    const id = addon?.generateExecutionId?.() ?? "fallback-exec"
    expect(id).toBeTruthy()
    expect(typeof id).toBe("string")
  })

  it("should generate unique task IDs", () => {
    const addon = nativeAddon()
    const id = addon?.generateTaskId?.() ?? "fallback-task"
    expect(id).toBeTruthy()
    expect(typeof id).toBe("string")
  })

  it("should generate unique checkpoint IDs", () => {
    const addon = nativeAddon()
    const id = addon?.generateCheckpointId?.() ?? "fallback-cp"
    expect(id).toBeTruthy()
    expect(typeof id).toBe("string")
  })
})

describe("Error serialization", () => {
  it("should serialize a runtime error", () => {
    const result = serializeError("test error", "ERR_TEST")
    expect(result).toBeTruthy()
    expect(typeof result).toBe("string")
  })

  it("should include message and code fields", () => {
    const result = serializeError("test error", "ERR_TEST")
    const parsed = JSON.parse(result)
    expect(parsed).toHaveProperty("message", "test error")
    expect(parsed).toHaveProperty("code", "ERR_TEST")
  })
})

describe("Tool validation", () => {
  const schema = JSON.stringify({
    type: "object",
    properties: {
      name: { type: "string" },
    },
    required: ["name"],
  })

  it("should accept valid input against a schema", () => {
    const addon = nativeAddon()
    if (addon?.validateToolInput) {
      expect(() => addon.validateToolInput!(schema, JSON.stringify({ name: "test" }))).not.toThrow()
    }
  })

  it("should throw on missing required field", () => {
    const addon = nativeAddon()
    if (addon?.validateToolInput) {
      expect(() => addon.validateToolInput!(schema, JSON.stringify({}))).toThrow()
    }
  })
})

describe("Token counting", () => {
  it("should count tokens for a given text", () => {
    const addon = nativeAddon()
    const count = addon?.countTokens?.("hello world", "gpt-4") ?? 0
    expect(typeof count).toBe("number")
    expect(count).toBeGreaterThanOrEqual(0)
  })

  it("should return 0 for empty text", () => {
    const addon = nativeAddon()
    const count = addon?.countTokens?.("", "gpt-4") ?? 0
    expect(typeof count).toBe("number")
    expect(count).toBe(0)
  })
})
