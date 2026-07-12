import type { AgentEvent, AgentInput, AgentResult } from "@vibe/agent"
import type { Tracer } from "./types"

/** The minimal agent surface the bridge needs. */
export interface StreamableAgent {
  stream(input: AgentInput, options?: unknown): AsyncGenerator<AgentEvent, AgentResult>
}

/**
 * Run an agent while tracing it: a root span for the whole run, one child span per
 * model iteration, and one per tool call — attributes carry names, iteration
 * numbers, and error flags. Returns the agent's `AgentResult`; feed a tracer with
 * an exporter to collect the spans.
 */
export async function traceAgentRun(
  agent: StreamableAgent,
  input: AgentInput,
  tracer: Tracer,
): Promise<AgentResult> {
  const root = tracer.startSpan("agent.run")
  const iterationSpans = new Map<number, { id: string; end: () => void }>()
  const toolSpans = new Map<string, { end: () => void }>()

  try {
    const gen = agent.stream(input)
    let next = await gen.next()
    while (!next.done) {
      const event = next.value
      handleEvent(event, tracer, root.id, iterationSpans, toolSpans)
      next = await gen.next()
    }
    const result = next.value
    root.setAttribute("iterations", result.iterations)
    root.setAttribute("stopReason", result.stopReason)
    root.setAttribute("outputTokens", result.usage.outputTokens)
    return result
  } catch (error) {
    root.setStatus("error")
    root.setAttribute("error", error instanceof Error ? error.message : String(error))
    throw error
  } finally {
    for (const span of iterationSpans.values()) span.end()
    root.end()
  }
}

function handleEvent(
  event: AgentEvent,
  tracer: Tracer,
  rootId: string,
  iterationSpans: Map<number, { id: string; end: () => void }>,
  toolSpans: Map<string, { end: () => void }>,
): void {
  if (event.type === "iteration") {
    const prev = iterationSpans.get(event.iteration - 1)
    if (prev) {
      prev.end()
      iterationSpans.delete(event.iteration - 1)
    }
    const span = tracer.startSpan(`iteration ${event.iteration}`, rootId)
    span.setAttribute("iteration", event.iteration)
    iterationSpans.set(event.iteration, span)
  } else if (event.type === "toolCall") {
    const span = tracer.startSpan(`tool ${event.name}`, rootId)
    span.setAttribute("tool", event.name)
    span.setAttribute("toolCallId", event.id)
    toolSpans.set(event.id, span)
  } else if (event.type === "toolResult") {
    const span = toolSpans.get(event.id)
    if (span) {
      if (event.isError) {
        ;(span as unknown as { setStatus: (s: "error") => void }).setStatus("error")
      }
      span.end()
      toolSpans.delete(event.id)
    }
  }
}
