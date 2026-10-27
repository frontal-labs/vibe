# vibe/security

Guardrails, PII redaction, rate limiting, and secrets for Vibe.

## What it does

Wraps tools and content with `createContentGuard` and `secureTool`, redacts
sensitive data via `createPIIRedactor`/`redactPII`, throttles usage with
`createRateLimiter`, and manages credentials with `createEnvSecrets`/
`createMemorySecrets`.

## Install

```sh
bun add vibe/security
```

## Usage

```ts
import { createPIIRedactor, createRateLimiter, secureTool } from "@vibe/security"

const redact = createPIIRedactor()
const limiter = createRateLimiter({ limit: 100, windowMs: 60_000 })
const safe = secureTool(tool, { guard: redact, rateLimit: limiter })
```
