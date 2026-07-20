import type { AnyTool, ToolContext, ToolResult } from "vibe/tools"

import type { GuardResult } from "./guardrails"
import type { RateLimiter } from "./rate-limit"
import type { SecretsProvider } from "./secrets"

export interface SecureToolOptions {
  /** Redact PII from the tool's output (and error messages) when provided. */
  redact?: (text: string) => string
  /** Reject tool calls whose serialized input trips this guard. */
  guard?: { check(text: string): GuardResult }
  /** Per-key rate limiter; a call is rejected once the key's budget is exhausted. */
  rateLimiter?: RateLimiter
  /** Secrets source exposed to the handler via `ctx.secrets`. */
  secrets?: SecretsProvider
  /** Rate-limit key (default the tool name); pass an actor/tenant id for per-tenant limits. */
  rateKey?: string
}

function toResult(value: string | ToolResult): ToolResult {
  return typeof value === "string" ? { content: value } : value
}

/**
 * Wrap a tool with security controls, applied per call in order: rate limit →
 * input guardrails → run (with `ctx.secrets` injected) → PII redaction of the
 * output. Blocked/limited calls return an `isError` result (never throw), matching
 * `runToolCall` semantics so the model can react; only cancellation unwinds.
 */
export function secureTool(tool: AnyTool, options: SecureToolOptions = {}): AnyTool {
  const redact = options.redact ?? ((text: string) => text)

  return {
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
    inputSchema: tool.inputSchema,
    execute: async (input, ctx: ToolContext) => {
      if (options.rateLimiter && !options.rateLimiter.tryAcquire(options.rateKey ?? tool.name)) {
        return { content: `Rate limit exceeded for "${tool.name}".`, isError: true }
      }

      if (options.guard) {
        const verdict = options.guard.check(JSON.stringify(input ?? {}))
        if (!verdict.ok) {
          return {
            content: `Blocked input for "${tool.name}": ${verdict.matches.join(", ")}`,
            isError: true,
          }
        }
      }

      const secureCtx: ToolContext = { ...ctx, secrets: options.secrets ?? ctx.secrets }
      try {
        const result = toResult(await tool.execute(input, secureCtx))
        return { content: redact(result.content), isError: result.isError }
      } catch (error) {
        // A cancelled run must unwind — don't disguise it as a tool result.
        if (ctx.cancellationToken?.cancelled) throw error
        const message = error instanceof Error ? error.message : String(error)
        return { content: redact(message), isError: true }
      }
    },
  }
}
