import { describe, it, expect, vi } from "vitest"

import { runWithLogContext } from "../src/context"
import { LogLevel, logLevelFromString, logLevelToString } from "../src/log-level"
import { createLogger } from "../src/logger"
import type { LogEntry, Transport } from "../src/types"

function createTestTransport(): { transport: Transport; entries: LogEntry[] } {
  const entries: LogEntry[] = []
  const transport: Transport = {
    log(entry: LogEntry) {
      entries.push(entry)
    },
  }
  return { transport, entries }
}

describe("LogLevel", () => {
  it("should have correct numeric values", () => {
    expect(LogLevel.Trace).toBe(0)
    expect(LogLevel.Debug).toBe(10)
    expect(LogLevel.Info).toBe(20)
    expect(LogLevel.Warn).toBe(30)
    expect(LogLevel.Error).toBe(40)
    expect(LogLevel.Fatal).toBe(50)
  })

  it("should parse from string", () => {
    expect(logLevelFromString("trace")).toBe(LogLevel.Trace)
    expect(logLevelFromString("debug")).toBe(LogLevel.Debug)
    expect(logLevelFromString("info")).toBe(LogLevel.Info)
    expect(logLevelFromString("warn")).toBe(LogLevel.Warn)
    expect(logLevelFromString("error")).toBe(LogLevel.Error)
    expect(logLevelFromString("fatal")).toBe(LogLevel.Fatal)
    expect(logLevelFromString("warning")).toBe(LogLevel.Warn)
    expect(logLevelFromString("unknown")).toBe(LogLevel.Info)
  })

  it("should convert to string", () => {
    expect(logLevelToString(LogLevel.Trace)).toBe("trace")
    expect(logLevelToString(LogLevel.Debug)).toBe("debug")
    expect(logLevelToString(LogLevel.Info)).toBe("info")
    expect(logLevelToString(LogLevel.Warn)).toBe("warn")
    expect(logLevelToString(LogLevel.Error)).toBe("error")
    expect(logLevelToString(LogLevel.Fatal)).toBe("fatal")
  })
})

describe("Logger", () => {
  it("should log messages at the configured level", () => {
    const { transport, entries } = createTestTransport()
    const logger = createLogger({
      level: LogLevel.Info,
      transports: [transport],
    })

    logger.info("hello")
    logger.debug("should not appear")

    expect(entries).toHaveLength(1)
    expect(entries[0]?.message).toBe("hello")
    expect(entries[0]?.level).toBe(LogLevel.Info)
  })

  it("should include timestamp in log entries", () => {
    const { transport, entries } = createTestTransport()
    const logger = createLogger({
      level: LogLevel.Info,
      transports: [transport],
    })

    logger.info("test")
    expect(entries[0]?.timestamp).toBeDefined()
    expect(typeof entries[0]?.timestamp).toBe("string")
  })

  it("should include meta in log entries", () => {
    const { transport, entries } = createTestTransport()
    const logger = createLogger({
      level: LogLevel.Info,
      transports: [transport],
    })

    logger.info("with meta", { userId: "123", action: "test" })
    expect(entries[0]?.meta.userId).toBe("123")
    expect(entries[0]?.meta.action).toBe("test")
  })

  it("should include default meta from options", () => {
    const { transport, entries } = createTestTransport()
    const logger = createLogger({
      level: LogLevel.Info,
      transports: [transport],
      defaultMeta: { service: "test-service", version: "1.0" },
    })

    logger.info("msg")
    expect(entries[0]?.meta.service).toBe("test-service")
    expect(entries[0]?.meta.version).toBe("1.0")
  })

  it("should merge default meta with per-call meta", () => {
    const { transport, entries } = createTestTransport()
    const logger = createLogger({
      level: LogLevel.Info,
      transports: [transport],
      defaultMeta: { service: "test" },
    })

    logger.info("msg", { requestId: "abc" })
    expect(entries[0]?.meta.service).toBe("test")
    expect(entries[0]?.meta.requestId).toBe("abc")
  })

  it("should filter messages below the configured level", () => {
    const { transport, entries } = createTestTransport()
    const logger = createLogger({
      level: LogLevel.Warn,
      transports: [transport],
    })

    logger.trace("trace")
    logger.debug("debug")
    logger.info("info")
    logger.warn("warn")
    logger.error("error")

    expect(entries).toHaveLength(2)
    expect(entries[0]?.message).toBe("warn")
    expect(entries[1]?.message).toBe("error")
  })

  it("should create child logger with merged meta", () => {
    const { transport, entries } = createTestTransport()
    const parent = createLogger({
      level: LogLevel.Info,
      transports: [transport],
      defaultMeta: { service: "parent" },
    })

    const child = parent.child({ component: "child" })
    child.info("from child")

    expect(entries[0]?.meta.service).toBe("parent")
    expect(entries[0]?.meta.component).toBe("child")
  })

  it("should include correlationId from context", async () => {
    const { transport, entries } = createTestTransport()
    const logger = createLogger({
      level: LogLevel.Info,
      transports: [transport],
    })

    await runWithLogContext({ correlationId: "corr-123" }, () => {
      logger.info("contextual")
    })

    expect(entries[0]?.correlationId).toBe("corr-123")
  })

  it("should not include correlationId when not in context", () => {
    const { transport, entries } = createTestTransport()
    const logger = createLogger({
      level: LogLevel.Info,
      transports: [transport],
    })

    logger.info("no context")
    expect(entries[0]?.correlationId).toBeUndefined()
  })

  it("should handle all log levels", () => {
    const { transport, entries } = createTestTransport()
    const logger = createLogger({
      level: LogLevel.Trace,
      transports: [transport],
    })

    logger.trace("t")
    logger.debug("d")
    logger.info("i")
    logger.warn("w")
    logger.error("e")
    logger.fatal("f")

    expect(entries).toHaveLength(6)
    expect(entries.map((e) => e.message)).toEqual(["t", "d", "i", "w", "e", "f"])
  })
})
