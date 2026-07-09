import { describe, expect, it } from "vitest"

import {
  assertDefined,
  assertNever,
  isDefined,
  isError,
  isFunction,
  isObject,
  isPromise,
  isString,
} from "../src/guards"

describe("assertNever", () => {
  it("should throw a TypeError with the default message", () => {
    expect(() => assertNever("test" as never)).toThrow(TypeError)
    expect(() => assertNever("test" as never)).toThrow("Unexpected value: test")
  })

  it("should throw a TypeError with a custom message", () => {
    expect(() => assertNever("val" as never, "custom msg")).toThrow("custom msg")
  })
})

describe("assertDefined", () => {
  it("should not throw for defined values", () => {
    expect(() => assertDefined("hello")).not.toThrow()
    expect(() => assertDefined(0)).not.toThrow()
    expect(() => assertDefined(false)).not.toThrow()
    expect(() => assertDefined({})).not.toThrow()
    expect(() => assertDefined("")).not.toThrow()
  })

  it("should throw for null", () => {
    expect(() => assertDefined(null)).toThrow(TypeError)
  })

  it("should throw for undefined", () => {
    expect(() => assertDefined(undefined)).toThrow(TypeError)
  })

  it("should support a custom message", () => {
    expect(() => assertDefined(null, "custom msg")).toThrow("custom msg")
  })
})

describe("isDefined", () => {
  it("should return true for defined values", () => {
    expect(isDefined("hello")).toBe(true)
    expect(isDefined(0)).toBe(true)
    expect(isDefined(false)).toBe(true)
    expect(isDefined("")).toBe(true)
  })

  it("should return false for null", () => {
    expect(isDefined(null)).toBe(false)
  })

  it("should return false for undefined", () => {
    expect(isDefined(undefined)).toBe(false)
  })
})

describe("isObject", () => {
  it("should return true for plain objects", () => {
    expect(isObject({})).toBe(true)
    expect(isObject({ a: 1 })).toBe(true)
  })

  it("should return false for arrays", () => {
    expect(isObject([])).toBe(false)
  })

  it("should return false for null", () => {
    expect(isObject(null)).toBe(false)
  })

  it("should return false for primitives", () => {
    expect(isObject("string")).toBe(false)
    expect(isObject(42)).toBe(false)
    expect(isObject(true)).toBe(false)
    expect(isObject(undefined)).toBe(false)
  })
})

describe("isString", () => {
  it("should return true for strings", () => {
    expect(isString("hello")).toBe(true)
    expect(isString("")).toBe(true)
  })

  it("should return false for non-strings", () => {
    expect(isString(42)).toBe(false)
    expect(isString(true)).toBe(false)
    expect(isString({})).toBe(false)
    expect(isString(null)).toBe(false)
    expect(isString(undefined)).toBe(false)
  })
})

describe("isError", () => {
  it("should return true for Error instances", () => {
    expect(isError(new Error())).toBe(true)
    expect(isError(new TypeError())).toBe(true)
  })

  it("should return false for non-Errors", () => {
    expect(isError({ message: "error" })).toBe(false)
    expect(isError(null)).toBe(false)
    expect(isError("error")).toBe(false)
  })
})

describe("isPromise", () => {
  it("should return true for promises", () => {
    expect(isPromise(Promise.resolve())).toBe(true)
    expect(isPromise(new Promise(() => {}))).toBe(true)
  })

  it("should return true for thenables", () => {
    // biome-ignore lint/suspicious/noThenProperty: intentionally creating a thenable for test
    expect(isPromise({ then: () => {} })).toBe(true)
  })

  it("should return false for non-promises", () => {
    expect(isPromise({})).toBe(false)
    expect(isPromise(null)).toBe(false)
    expect(isPromise(42)).toBe(false)
  })
})

describe("isFunction", () => {
  it("should return true for functions", () => {
    expect(isFunction(() => {})).toBe(true)
    // eslint-disable-next-line func-style
    expect(isFunction(function named() {})).toBe(true)
    expect(isFunction(async () => {})).toBe(true)
  })

  it("should return false for non-functions", () => {
    expect(isFunction({})).toBe(false)
    expect(isFunction(null)).toBe(false)
    expect(isFunction(42)).toBe(false)
  })
})
