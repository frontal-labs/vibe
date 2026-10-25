import { expectType } from "tsd"

import {
  createEnvSecrets,
  createMemorySecrets,
  createRateLimiter,
  type RateLimiter,
  type RedactionResult,
  redactPII,
  type SecretsProvider,
} from "../src/index"

const redacted = redactPII("mail me at a@example.com")
expectType<RedactionResult>(redacted)
expectType<string>(redacted.text)

expectType<RateLimiter>(createRateLimiter({ limit: 10, windowMs: 60_000 }))
expectType<SecretsProvider>(createEnvSecrets())
expectType<SecretsProvider>(createMemorySecrets({ TOKEN: "t" }))
