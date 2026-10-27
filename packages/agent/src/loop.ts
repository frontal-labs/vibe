import { runtimeError } from "@@vibe/errors"
import type { CompactionStrategy, Conversation } from "@@vibe/memory"
import { buildRequest } from "@@vibe/memory"
import type { ContentBlock, Effort, ModelProvider, ModelResponse, TokenUsage } from "@@vibe/model"
import { contextWindowFor, priceUsd, tokenFamilyFor } from "@@vibe/model"
import { createCancellationTokenSource, defaultRetryPolicy, executeWithRetry } from "@@vibe/runtime"
import type { ToolRegistry } from "@@vibe/tools"
import { runToolCall } from "@@vibe/tools"

import { AGENT_HOOKS, type AgentHookEmitter } from "./hooks"
import { summarizeHistory } from "./summarize"
import type { AgentEvent, AgentInput, AgentResult, RunOptions, RunTimings } from "./types"

/** Agent-level governance: every tool call is checked against `engine` before it runs. */
export interface GovernanceConfig {
  engine: PolicyEngine
  /** Called when a policy requires approval; resolve `true` to allow the call. Default: deny. */
  onApproval?: (request: PolicyRequest) => boolean | Promise<boolean>
}

export interface LoopConfig {
  provider: ModelProvider
  model: string
  system?: string
  effort?: Effort
  maxTokens?: number
  registry: ToolRegistry
  conversation: Conversation
  /**
   * Max input tokens per request. Defaults to the model's context window minus an output reserve,
   * so long conversations are compacted to fit instead of overflowing the provider (a 400).
   */
  budget?: number
  /** How to compact the transcript when over budget. Defaults to `drop-oldest`. */
  compaction?: CompactionStrategy
  /** Policy enforcement for tool calls. Absent means no policy (every call is allowed). */
  governance?: GovernanceConfig
  /** Conversation store. Used only by runs that pass `options.conversationId`. */
  memory?: Memory
  /** Delivers `agent:*` hooks to plugins. Absent means no hooks are emitted. */
  hooks?: AgentHookEmitter
  /**
   * Wrap tool output in `<tool_output trust="untrusted">` before the model sees it. Default true.
   * Framing is a mitigation against prompt injection through tool results, not a guarantee.
   */
  frameToolOutput?: boolean
}

const EMPTY_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 }
/** Tokens held back from the context window for the model's output when no explicit budget is set. */
const DEFAULT_OUTPUT_RESERVE = 4096
/** Extra safety margin below the context window (schemas, framing the counter can't see exactly). */
const BUDGET_SAFETY_MARGIN = 1024

/** The input-token budget for a request: explicit, else context window minus output reserve. */
function resolveBudget(config: LoopConfig): number {
  if (config.budget !== undefined) return config.budget
  const reserve = (config.maxTokens ?? DEFAULT_OUTPUT_RESERVE) + BUDGET_SAFETY_MARGIN
  return Math.max(BUDGET_SAFETY_MARGIN, contextWindowFor(config.model) - reserve)
}

/**
 * The agent run loop, as an async generator. `run()` drains it; `stream()` exposes it directly.
 *
 * Each iteration: optional summarizing compaction → stream the model response (text and thinking
 * deltas are forwarded as they arrive) → authorize and run tool calls in parallel → append the
 * results as one user message. When `options.checkpoint` is set, the transcript is saved after
 * every completed iteration and a prior checkpoint for the same run id is resumed.
 */
export async function* runLoop(
  config: LoopConfig,
  input: AgentInput,
  options: RunOptions = {},
): AsyncGenerator<AgentEvent, AgentResult> {
  const { provider, registry, conversation } = config
  const text = typeof input === "string" ? input : input.text
  // Own a token source so retry/cancellation work even when the caller gives none.
  const token = options.cancellationToken ?? createCancellationTokenSource().token
  const maxIterations = options.maxIterations ?? 10
  const retry = defaultRetryPolicy()
  const budget = resolveBudget(config)
  const tokenFamily = tokenFamilyFor(config.model)
  const frame = config.frameToolOutput ?? true
  const checkpoint = options.checkpoint
  const persisted =
    config.memory && options.conversationId
      ? { store: config.memory, id: options.conversationId }
      : undefined

  const resumed = checkpoint ? await checkpoint.store.load(checkpoint.runId) : undefined
  let iterations = 0
  let usage: TokenUsage = EMPTY_USAGE
  if (resumed) {
    conversation.replace(resumed.messages as Message[])
    iterations = resumed.iteration
    usage = resumed.usage
    options.logger?.info("agent:resume", { runId: checkpoint?.runId, iteration: iterations })
  } else {
    // A persisted conversation contributes its earlier turns before the new input.
    if (persisted) conversation.appendMany(await persisted.store.load(persisted.id))
    conversation.append({ role: "user", content: text })
  }

  const timings = newTimings()
  const startedAt = performance.now()

  while (true) {
    token.throwIfCancelled()
    if (++iterations > maxIterations) {
      throw runtimeError(`Agent exceeded maxIterations (${maxIterations})`)
    }
    // Cost backstop: enforce before the next (billable) model call, never discarding a done result.
    if (options.maxCostCents !== undefined) {
      const cents = priceUsd(usage, config.model) * 100
      if (cents > options.maxCostCents) {
        throw runtimeError(
          `Agent exceeded maxCostCents (${options.maxCostCents}); spent ~${cents.toFixed(3)}¢`,
        )
      }
    }
    await config.hooks?.(AGENT_HOOKS.iteration, {
      iteration: iterations,
      conversationId: options.conversationId,
    })
    yield { type: "iteration", iteration: iterations }

    if (config.compaction === "summarize") {
      const summaryUsage = await summarizeHistory({
        provider,
        model: config.model,
        conversation,
        system: config.system,
        budget,
      })
      if (summaryUsage) usage = addUsage(usage, summaryUsage)
    }

    const request: ModelRequest = buildRequest({
      model: config.model,
      conversation,
      system: config.system,
      tools: registry.toSchemas(),
      effort: config.effort,
      maxTokens: config.maxTokens,
      budget,
      tokenFamily,
      compaction: config.compaction,
    })

    const modelStart = performance.now()
    const response: ModelResponse = yield* streamModel(provider, request, {
      token,
      retry,
      logger: options.logger,
    })
    const modelMs = performance.now() - modelStart

    usage = addUsage(usage, response.usage)
    conversation.append({ role: "assistant", content: response.content })

    if (response.stopReason !== "tool_use") {
      // end_turn | max_tokens | refusal | pause → the run is over.
      recordIteration(timings, iterations, modelMs, 0, 0)
      timings.totalMs = performance.now() - startedAt
      yield { type: "timing", iteration: iterations, modelMs, toolsMs: 0 }
      const result = finish(response, usage, iterations, conversation, timings)
      if (persisted) await persisted.store.save(persisted.id, conversation.snapshot())
      if (checkpoint) await checkpoint.store.clear(checkpoint.runId)
      await config.hooks?.(AGENT_HOOKS.done, {
        text: result.text,
        iterations,
        stopReason: result.stopReason,
        usage,
      })
      yield { type: "done", result }
      return result
    }

    // tool_use: announce every call, authorize and run them in parallel, then feed results back.
    const calls = response.content.filter(isToolUse)
    for (const call of calls) {
      await config.hooks?.(AGENT_HOOKS.toolCall, {
        id: call.id,
        name: call.name,
        input: call.input,
        actor: options.actor,
      })
      yield { type: "toolCall", id: call.id, name: call.name, input: call.input }
    }

    const toolsStart = performance.now()
    const executed = await Promise.all(
      calls.map(async (call) => {
        const raw = await executeCall(call, { registry, config, options, token })
        const content =
          frame && !raw.notice ? frameUntrustedOutput(call.name, raw.content) : raw.content
        return { call, raw, block: toolResultBlock(call.id, content, raw.isError) }
      }),
    )
    const toolsMs = performance.now() - toolsStart
    recordIteration(timings, iterations, modelMs, toolsMs, calls.length)
    yield { type: "timing", iteration: iterations, modelMs, toolsMs }

    for (const { call, raw, block } of executed) {
      await config.hooks?.(AGENT_HOOKS.toolResult, {
        id: call.id,
        name: call.name,
        content: raw.content,
        isError: block.isError,
      })
      yield {
        type: "toolResult",
        id: call.id,
        name: call.name,
        content: raw.content,
        isError: raw.isError,
      }
    }

    conversation.append({ role: "user", content: executed.map((e) => e.block) })

    // The iteration is complete (assistant turn and all tool results are in the transcript), so
    // it is a safe point to resume from.
    if (checkpoint) {
      await checkpoint.store.save(checkpoint.runId, {
        messages: conversation.snapshot(),
        iteration: iterations,
        usage,
      })
    }
  }
}

interface StreamContext {
  token: CancellationToken
  retry: RetryPolicy
  logger: RunOptions["logger"]
}

/**
 * Stream one model call, forwarding text and thinking deltas as they arrive, and return the final
 * response. A transient failure is retried only before the first delta reaches the caller, so a
 * consumer never sees the same text twice.
 */
async function* streamModel(
  provider: ModelProvider,
  request: ModelRequest,
  ctx: StreamContext,
): AsyncGenerator<AgentEvent, ModelResponse> {
  for (let attempt = 1; ; attempt++) {
    ctx.token.throwIfCancelled()
    let emitted = false
    try {
      let final: ModelResponse | undefined
      for await (const event of provider.stream(request)) {
        if (event.type === "done") {
          final = event.response
        } else if (event.type === "text" || event.type === "thinking") {
          emitted = true
          yield { type: event.type, delta: event.delta }
        }
      }
      if (!final) throw runtimeError("Model stream ended without a final response")
      return final
    } catch (error) {
      const retryable =
        !emitted &&
        attempt < ctx.retry.maxAttempts &&
        !ctx.token.cancelled &&
        isRetryableError(error)
      if (!retryable) throw error
      ctx.logger?.warn("model:retry", { attempt, error: String(error) })
      await new Promise((resolve) => setTimeout(resolve, calculateDelay(attempt, ctx.retry)))
    }
  }
}

interface ExecuteContext {
  registry: ToolRegistry
  config: LoopConfig
  options: RunOptions
  token: CancellationToken
}

interface CallOutcome {
  content: string
  isError: boolean
  /**
   * True when the content is the runtime's own notice (unknown tool, governance refusal) rather
   * than output from a tool. Only tool output is framed as untrusted data.
   */
  notice: boolean
}

/** Authorize one tool call against governance, then run it. Never throws except on cancellation. */
async function executeCall(
  call: { id: string; name: string; input: unknown },
  ctx: ExecuteContext,
): Promise<CallOutcome> {
  const tool = ctx.registry.get(call.name)
  if (!tool) return { content: `Unknown tool: "${call.name}"`, isError: true, notice: true }

  const refusal = await authorize(call, ctx)
  if (refusal) return { content: refusal, isError: true, notice: true }

  const result = await runToolCall(
    tool,
    call.input,
    { cancellationToken: ctx.token, logger: ctx.options.logger },
    { timeoutMs: ctx.options.toolTimeoutMs },
  )
  return { content: result.content, isError: result.isError ?? false, notice: false }
}

/** Returns a refusal message when policy denies the call, or approval is required and not given. */
async function authorize(
  call: { name: string; input: unknown },
  ctx: ExecuteContext,
): Promise<string | undefined> {
  const governance = ctx.config.governance
  if (!governance) return undefined

  const request: PolicyRequest = {
    tool: call.name,
    input: call.input,
    actor: ctx.options.actor,
  }
  const ruling = await governance.engine.evaluate(request)
  if (ruling.decision === "deny") {
    return ruling.reason ?? `Tool "${call.name}" is not permitted.`
  }
  if (ruling.decision === "require-approval") {
    const approved = governance.onApproval ? await governance.onApproval(request) : false
    if (!approved) return `Tool "${call.name}" requires approval and was not approved.`
  }
  return undefined
}

function newTimings(): RunTimings & {
  iterations: { index: number; modelMs: number; toolsMs: number }[]
} {
  return { totalMs: 0, model: { ms: 0, calls: 0 }, tools: { ms: 0, calls: 0 }, iterations: [] }
}

function recordIteration(
  timings: RunTimings & { iterations: { index: number; modelMs: number; toolsMs: number }[] },
  index: number,
  modelMs: number,
  toolsMs: number,
  toolCalls: number,
): void {
  timings.model.ms += modelMs
  timings.model.calls += 1
  timings.tools.ms += toolsMs
  timings.tools.calls += toolCalls
  timings.iterations.push({ index, modelMs, toolsMs })
}

function isToolUse(
  block: ContentBlock,
): block is { type: "toolUse"; id: string; name: string; input: unknown } {
  return block.type === "toolUse"
}

function toolResultBlock(
  toolUseId: string,
  content: string,
  isError: boolean,
): { type: "toolResult"; toolUseId: string; content: string; isError: boolean } {
  return { type: "toolResult", toolUseId, content, isError }
}

function finish(
  response: ModelResponse,
  usage: TokenUsage,
  iterations: number,
  conversation: Conversation,
  timings: RunTimings,
): AgentResult {
  const text = response.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("")
  return {
    text,
    response,
    usage,
    iterations,
    stopReason: response.stopReason,
    transcript: conversation.snapshot(),
    timings,
  }
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: (a.cacheReadTokens ?? 0) + (b.cacheReadTokens ?? 0),
    cacheWriteTokens: (a.cacheWriteTokens ?? 0) + (b.cacheWriteTokens ?? 0),
  }
}
