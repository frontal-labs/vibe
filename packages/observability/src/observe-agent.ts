import type { Agent, AgentEvent } from "@vibe/agent"

import type { AuditLog } from "./audit"
import { costOf } from "./cost"
import type { Metrics } from "./metrics"

export interface ObserveServices {
  metrics: Metrics
  audit: AuditLog
}

export interface ObserveOptions {
  /** Model id for cost pricing (defaults to the final response's model). */
  model?: string
  /** Actor/tenant recorded on audit entries. */
  actor?: string
  /** Fixed correlation id; when omitted, one is generated per run. */
  correlationId?: string
}

let runCounter = 0
function nextCorrelationId(): string {
  runCounter += 1
  return `run_${Date.now()}_${runCounter}`
}

/** A per-run event recorder writing metrics + audit entries. */
function makeRecorder(
  services: ObserveServices,
  options: ObserveOptions,
  correlationId: string,
): (event: AgentEvent) => void {
  const { metrics, audit } = services
  return (event) => {
    switch (event.type) {
      case "toolCall":
        metrics.increment("tool.calls")
        audit.record({
          action: "tool.call",
          actor: options.actor,
          correlationId,
          detail: { tool: event.name },
        })
        break
      case "toolResult":
        if (event.isError) metrics.increment("tool.errors")
        break
      case "done": {
        const { result } = event
        metrics.observe("iterations", result.iterations)
        metrics.observe("tokens.input", result.usage.inputTokens)
        metrics.observe("tokens.output", result.usage.outputTokens)
        metrics.observe(
          "cost.usd",
          costOf(result.usage, options.model ?? result.response.model).totalUsd,
        )
        audit.record({
          action: "agent.done",
          actor: options.actor,
          correlationId,
          detail: { stopReason: result.stopReason, iterations: result.iterations },
        })
        break
      }
      default:
        break
    }
  }
}

/**
 * Wrap an agent so every run records observability signals — tool calls/errors,
 * iterations, token usage, and USD cost to `metrics`, plus an audit trail (per tool
 * call + final) with a correlation id. `run` composes the recorder into `onEvent`;
 * `stream` tees each yielded event, so both paths are covered. Any caller-supplied
 * `onEvent` still fires.
 */
export function observeAgent(
  agent: Agent,
  services: ObserveServices,
  options: ObserveOptions = {},
): Agent {
  return {
    model: agent.model,
    run: (input, opts) => {
      const correlationId = options.correlationId ?? nextCorrelationId()
      const record = makeRecorder(services, options, correlationId)
      return agent.run(input, {
        ...opts,
        onEvent: (event) => {
          record(event)
          opts?.onEvent?.(event)
        },
      })
    },
    stream: async function* stream(input, opts) {
      const correlationId = options.correlationId ?? nextCorrelationId()
      const record = makeRecorder(services, options, correlationId)
      const gen = agent.stream(input, opts)
      let next = await gen.next()
      while (!next.done) {
        record(next.value)
        yield next.value
        next = await gen.next()
      }
      return next.value
    },
  }
}
