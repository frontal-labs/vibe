import type { AgentEvent } from "@vibe/agent"

/**
 * Build an event printer for `RunOptions.onEvent` / `stream()`: pretty one-liners
 * for iteration, tool call, tool result, and completion. Pass a custom `write` to
 * redirect (e.g. a logger or a buffer in tests).
 */
export function createEventPrinter(write: (line: string) => void = console.log) {
  return (event: AgentEvent): void => {
    switch (event.type) {
      case "iteration":
        write(`— iteration ${event.iteration}`)
        break
      case "text":
        write(event.delta)
        break
      case "toolCall":
        write(`→ ${event.name}(${JSON.stringify(event.input)})`)
        break
      case "toolResult":
        write(`← ${event.isError ? "[error] " : ""}${event.content}`)
        break
      case "done":
        write(`✓ done (${event.result.iterations} iterations)`)
        break
      default:
        break
    }
  }
}
