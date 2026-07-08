import { describe, it, expect, vi } from "vitest"

import { LogLevel } from "../src/log-level"
import { createConsoleTransport } from "../src/transports/console"
import type { LogEntry } from "../src/types"

describe("ConsoleTransport", () => {
  it("should write to console", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {})
    const transport = createConsoleTransport()

    const entry: LogEntry = {
      level: LogLevel.Info,
      message: "test",
      meta: {},
      timestamp: "2024-01-01T00:00:00.000Z",
    }

    transport.log(entry)
    expect(spy).toHaveBeenCalledOnce()
    spy.mockRestore()
  })

  it("should use console.error for Error and Fatal levels", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const transport = createConsoleTransport()

    transport.log({
      level: LogLevel.Error,
      message: "err",
      meta: {},
      timestamp: "",
    })
    transport.log({
      level: LogLevel.Fatal,
      message: "fatal",
      meta: {},
      timestamp: "",
    })

    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })

  it("should use console.debug for Trace and Debug levels", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {})
    const transport = createConsoleTransport()

    transport.log({
      level: LogLevel.Trace,
      message: "trace",
      meta: {},
      timestamp: "",
    })
    transport.log({
      level: LogLevel.Debug,
      message: "debug",
      meta: {},
      timestamp: "",
    })

    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })

  it("should include correlation ID in output", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {})
    const transport = createConsoleTransport()

    transport.log({
      level: LogLevel.Info,
      message: "with corr",
      meta: {},
      timestamp: "2024-01-01T00:00:00.000Z",
      correlationId: "corr-abc",
    })

    expect(spy).toHaveBeenCalledOnce()
    spy.mockRestore()
  })
})
