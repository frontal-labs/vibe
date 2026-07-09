import { describe, expect, it } from "vitest"

import { ErrorCode } from "../src/error-codes"
import {
  CancelledError,
  ConfigError,
  LifecycleError,
  NotImplementedError,
  ProviderAuthError,
  ProviderRateLimitError,
  RuntimeError,
  TimeoutError,
  ToolError,
  ValidationError,
} from "../src/errors"
import {
  cancelledError,
  configError,
  lifecycleError,
  notImplementedError,
  providerAuthError,
  providerRateLimitError,
  runtimeError,
  timeoutError,
  toolError,
  validationError,
} from "../src/factories"
import type { ErrorSerialized } from "../src/types"
import { VibeError } from "../src/vibe-error"

describe("VibeError", () => {
  it("should create a basic error", () => {
    const error = new VibeError({
      message: "something went wrong",
      code: ErrorCode.RuntimePanic,
    })
    expect(error.message).toBe("something went wrong")
    expect(error.code).toBe(ErrorCode.RuntimePanic)
    expect(error.fatal).toBe(false)
    expect(error.retryable).toBe(false)
  })

  it("should set fatal and retryable flags", () => {
    const error = new VibeError({
      message: "test",
      code: ErrorCode.ConfigInvalid,
      fatal: true,
      retryable: true,
    })
    expect(error.fatal).toBe(true)
    expect(error.retryable).toBe(true)
  })

  it("should serialize to JSON", () => {
    const error = new VibeError({
      message: "serialize me",
      code: ErrorCode.Timeout,
      fatal: true,
      retryable: true,
    })
    const json = error.toJSON()
    expect(json.message).toBe("serialize me")
    expect(json.code).toBe(ErrorCode.Timeout)
    expect(json.fatal).toBe(true)
    expect(json.retryable).toBe(true)
    expect(json.name).toBe("VibeError")
    expect(json.stack).toBeDefined()
  })

  it("should serialize nested cause", () => {
    const inner = new VibeError({
      message: "inner cause",
      code: ErrorCode.ValidationFailed,
    })
    const outer = new VibeError({
      message: "outer",
      code: ErrorCode.RuntimePanic,
      cause: inner,
    })
    const json = outer.toJSON()
    expect(json.cause).toBeDefined()
    expect(json.cause?.message).toBe("inner cause")
  })

  it("should deserialize from JSON", () => {
    const json: ErrorSerialized = {
      name: "VibeError",
      message: "hello from json",
      code: ErrorCode.Cancelled,
      fatal: true,
      retryable: false,
      stack: "Error\n    at test (file.ts:1:1)",
    }
    const error = VibeError.fromJSON(json)
    expect(error.message).toBe("hello from json")
    expect(error.code).toBe(ErrorCode.Cancelled)
    expect(error.fatal).toBe(true)
    expect(error.retryable).toBe(false)
    expect(error.stack).toBe(json.stack)
  })

  it("should roundtrip serialization", () => {
    const original = new TimeoutError("request timed out", 5000)
    const json = original.toJSON()
    const restored = VibeError.fromJSON(json)
    expect(restored.message).toBe(original.message)
    expect(restored.code).toBe(original.code)
    expect(restored.fatal).toBe(original.fatal)
    expect(restored.retryable).toBe(original.retryable)
    expect(restored instanceof VibeError).toBe(true)
  })

  it("should detect VibeError via isVibeError", () => {
    expect(VibeError.isVibeError(new ConfigError("test"))).toBe(true)
    expect(VibeError.isVibeError(new Error("plain"))).toBe(false)
    expect(VibeError.isVibeError(null)).toBe(false)
    expect(VibeError.isVibeError("string")).toBe(false)
  })
})

describe("typed errors", () => {
  it("ConfigError should be fatal and non-retryable", () => {
    const error = new ConfigError("invalid config")
    expect(error).toBeInstanceOf(VibeError)
    expect(error.fatal).toBe(true)
    expect(error.retryable).toBe(false)
    expect(error.code).toBe(ErrorCode.ConfigInvalid)
  })

  it("RuntimeError should be fatal and retryable", () => {
    const error = new RuntimeError("runtime panic")
    expect(error.fatal).toBe(true)
    expect(error.retryable).toBe(true)
    expect(error.code).toBe(ErrorCode.RuntimePanic)
  })

  it("ValidationError should be non-fatal and non-retryable", () => {
    const error = new ValidationError("invalid input")
    expect(error.fatal).toBe(false)
    expect(error.retryable).toBe(false)
    expect(error.code).toBe(ErrorCode.ValidationFailed)
  })

  it("TimeoutError should include timeoutMs", () => {
    const error = new TimeoutError("timed out", 30000)
    expect(error.timeoutMs).toBe(30000)
    expect(error.retryable).toBe(true)
    expect(error.code).toBe(ErrorCode.Timeout)
    const json = error.toJSON()
    expect((json as Record<string, unknown>).timeoutMs).toBe(30000)
  })

  it("CancelledError should be non-retryable", () => {
    const error = new CancelledError("cancelled")
    expect(error.retryable).toBe(false)
    expect(error.code).toBe(ErrorCode.Cancelled)
  })

  it("ToolError should be retryable", () => {
    const error = new ToolError("tool failed")
    expect(error.retryable).toBe(true)
    expect(error.code).toBe(ErrorCode.ToolExecutionFailed)
  })

  it("LifecycleError should be fatal", () => {
    const error = new LifecycleError("invalid transition")
    expect(error.fatal).toBe(true)
    expect(error.code).toBe(ErrorCode.LifecycleInvalidTransition)
  })

  it("NotImplementedError should be fatal", () => {
    const error = new NotImplementedError("not implemented yet")
    expect(error.fatal).toBe(true)
    expect(error.code).toBe(ErrorCode.NotImplemented)
  })

  it("ProviderAuthError should be fatal", () => {
    const error = new ProviderAuthError("auth failed")
    expect(error.fatal).toBe(true)
    expect(error.retryable).toBe(false)
    expect(error.code).toBe(ErrorCode.ProviderAuthFailed)
  })

  it("ProviderRateLimitError should be retryable", () => {
    const error = new ProviderRateLimitError("rate limited")
    expect(error.fatal).toBe(false)
    expect(error.retryable).toBe(true)
    expect(error.code).toBe(ErrorCode.ProviderRateLimited)
  })
})

describe("error factories", () => {
  it("should create errors via factory functions", () => {
    expect(configError("cfg")).toBeInstanceOf(ConfigError)
    expect(runtimeError("rt")).toBeInstanceOf(RuntimeError)
    expect(validationError("val")).toBeInstanceOf(ValidationError)
    expect(toolError("tool")).toBeInstanceOf(ToolError)
    expect(timeoutError("to", 1000)).toBeInstanceOf(TimeoutError)
    expect(cancelledError("cancel")).toBeInstanceOf(CancelledError)
    expect(lifecycleError("life")).toBeInstanceOf(LifecycleError)
    expect(notImplementedError("ni")).toBeInstanceOf(NotImplementedError)
    expect(providerAuthError("auth")).toBeInstanceOf(ProviderAuthError)
    expect(providerRateLimitError("rl")).toBeInstanceOf(ProviderRateLimitError)
  })

  it("should propagate cause in factory", () => {
    const cause = new Error("root cause")
    const error = configError("wrapped", cause)
    expect(error.cause).toBe(cause)
  })
})
