import { describe, expect, it } from "vitest"

import { createContainer } from "../src/container"
import { createToken } from "../src/token"

interface Database {
  query(sql: string): string
}

interface Logger {
  log(message: string): void
}

describe("Container", () => {
  it("should resolve singleton instances", () => {
    const container = createContainer()
    const token = createToken<string>("config")

    container.register(token, () => "hello")
    expect(container.resolve(token)).toBe("hello")
  })

  it("should return the same instance for singletons", () => {
    const container = createContainer()
    const token = createToken<{ id: number }>("obj")

    container.register(token, () => ({ id: Math.random() }))
    const a = container.resolve(token)
    const b = container.resolve(token)
    expect(a).toBe(b)
  })

  it("should create new instances for transient scope", () => {
    const container = createContainer()
    const token = createToken<{ id: number }>("obj")

    container.register(token, () => ({ id: Math.random() }), "transient")
    const a = container.resolve(token)
    const b = container.resolve(token)
    expect(a).not.toBe(b)
  })

  it("should resolve dependencies", () => {
    const container = createContainer()
    const loggerToken = createToken<Logger>("logger")
    const dbToken = createToken<Database>("db")

    container.register(loggerToken, () => ({
      log(_message: string) {},
    }))

    container.register(
      dbToken,
      (c) => {
        const logger = c.resolve(loggerToken)
        return {
          query(sql: string) {
            logger.log(`Executing: ${sql}`)
            return `result: ${sql}`
          },
        }
      },
      "singleton",
    )

    const db = container.resolve(dbToken)
    expect(db.query("SELECT 1")).toBe("result: SELECT 1")
  })

  it("should detect circular dependencies", () => {
    const container = createContainer()
    const aToken = createToken<unknown>("a")
    const bToken = createToken<unknown>("b")

    container.register(aToken, (c) => c.resolve(bToken))
    container.register(bToken, (c) => c.resolve(aToken))

    expect(() => container.resolve(aToken)).toThrow()
  })

  it("should throw when resolving unregistered token", () => {
    const container = createContainer()
    const token = createToken<string>("missing")

    expect(() => container.resolve(token)).toThrow()
  })

  it("should throw when registering duplicate token", () => {
    const container = createContainer()
    const token = createToken<string>("dup")

    container.register(token, () => "first")
    expect(() => container.register(token, () => "second")).toThrow()
  })

  it("should check isRegistered", () => {
    const container = createContainer()
    const token = createToken<string>("check")

    expect(container.isRegistered(token)).toBe(false)
    container.register(token, () => "val")
    expect(container.isRegistered(token)).toBe(true)
  })

  it("should support registerInstance", () => {
    const container = createContainer()
    const token = createToken<{ x: number }>("inst")

    const obj = { x: 42 }
    container.registerInstance(token, obj)

    expect(container.resolve(token)).toBe(obj)
  })

  it("should create scoped containers", () => {
    const container = createContainer()
    const token = createToken<string>("parent")

    container.register(token, () => "parent-value")

    const scope = container.createScope()
    expect(scope.resolve(token)).toBe("parent-value")
  })

  it("should allow overriding registrations in scoped containers", () => {
    const container = createContainer()
    const token = createToken<string>("override")

    container.register(token, () => "original")

    const scope = container.createScope()
    scope.register(token, () => "overridden")

    expect(scope.resolve(token)).toBe("overridden")
    expect(container.resolve(token)).toBe("original")
  })

  it("should support dispose", () => {
    const container = createContainer()
    const token = createToken<string>("temp")

    container.register(token, () => "val")
    expect(container.resolve(token)).toBe("val")
    container.dispose()
    expect(() => container.resolve(token)).toThrow()
  })
})
