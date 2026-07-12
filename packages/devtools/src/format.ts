import type { AgentResult } from "@vibe/agent"
import type { Message, TokenUsage } from "@vibe/model"

import { estimateCost } from "./cost"

/** One-line token-usage summary. */
export function formatUsage(usage: TokenUsage): string {
  return `in=${usage.inputTokens} out=${usage.outputTokens} total=${usage.inputTokens + usage.outputTokens}`
}

/** Render a transcript as readable, role-prefixed lines. */
export function formatTranscript(transcript: readonly Message[]): string {
  return transcript
    .map((message) => {
      const text =
        typeof message.content === "string"
          ? message.content
          : message.content
              .map((block) => {
                if (block.type === "text" || block.type === "thinking") return block.text
                if (block.type === "toolUse")
                  return `→ ${block.name}(${JSON.stringify(block.input)})`
                if (block.type === "toolResult") return `← ${block.content}`
                return ""
              })
              .join(" ")
      return `${message.role.padEnd(9)} ${text}`
    })
    .join("\n")
}

/** A compact run summary: stop reason, iterations, usage, and estimated cost. */
export function summarizeResult(result: AgentResult, model = "claude-opus-4-8"): string {
  const cost = estimateCost(result.usage, model)
  return [
    `stop=${result.stopReason}`,
    `iterations=${result.iterations}`,
    formatUsage(result.usage),
    `~$${cost.totalUsd.toFixed(4)}`,
  ].join("  ")
}
