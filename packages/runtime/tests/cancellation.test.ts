import { describe, expect, it } from "vitest"

import { createCancellationTokenSource } from "../src/cancellation"

describe("CancellationTokenSource", () => {
  it("should create a token that is not cancelled initially", () => {
    const source = createCancellationTokenSource()
    expect(source.token.cancelled).toBe(false)
    expect(source.token.reason).toBeUndefined()
  })

  it("should cancel the token when cancel is called", () => {
    const source = createCancellationTokenSource()
    source.cancel("test reason")
    expect(source.token.cancelled).toBe(true)
    expect(source.token.reason).toBe("test reason")
  })

  it("should be idempotent when cancelling multiple times", () => {
    const source = createCancellationTokenSource()
    source.cancel("first")
    source.cancel("second")
    expect(source.token.cancelled).toBe(true)
    expect(source.token.reason).toBe("first")
  })

  it("should throw when throwIfCancelled is called after cancel", () => {
    const source = createCancellationTokenSource()
    source.cancel("intentional")
    expect(() => source.token.throwIfCancelled()).toThrow()
  })

  it("should not throw when throwIfCancelled is called before cancel", () => {
    const source = createCancellationTokenSource()
    expect(() => source.token.throwIfCancelled()).not.toThrow()
  })

  it("should invoke onCancelled listeners when cancelled", () => {
    const source = createCancellationTokenSource()
    let called = false
    source.token.onCancelled(() => {
      called = true
    })
    source.cancel()
    expect(called).toBe(true)
  })

  it("should invoke onCancelled immediately if already cancelled", () => {
    const source = createCancellationTokenSource()
    source.cancel()
    let called = false
    source.token.onCancelled(() => {
      called = true
    })
    expect(called).toBe(true)
  })

  it("should return a dispose function from onCancelled", () => {
    const source = createCancellationTokenSource()
    let called = false
    const dispose = source.token.onCancelled(() => {
      called = true
    })
    dispose()
    source.cancel()
    expect(called).toBe(false)
  })

  it("should clear listeners after cancellation", () => {
    const source = createCancellationTokenSource()
    let callCount = 0
    source.token.onCancelled(() => {
      callCount++
    })
    source.cancel()
    expect(callCount).toBe(1)
  })
})
