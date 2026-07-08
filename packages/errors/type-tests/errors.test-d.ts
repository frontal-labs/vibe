import { expectType } from "tsd"

import type { ErrorCode } from "../src/error-codes"
import type { ErrorSerialized } from "../src/types"
import { VibeError } from "../src/vibe-error"

// Serialized error should have all required fields
const serialized: ErrorSerialized = {
  name: "TestError",
  message: "test",
  code: "VIBE_INTERNAL_ERROR" as ErrorCode,
  fatal: false,
  retryable: false,
}
expectType<string>(serialized.message)
expectType<ErrorCode>(serialized.code)

// VibeError.fromJSON should return VibeError
const error = VibeError.fromJSON(serialized)
expectType<VibeError>(error)
