import { runtimeError } from "@vibe/errors"
import { buildRequest } from "@vibe/memory"
import type { Conversation } from "@vibe/memory"
import type { ContentBlock, Effort, ModelProvider, ModelResponse, TokenUsage } from "@vibe/model"
import { createCancellationTokenSource, defaultRetryPolicy, executeWithRetry } from "@vibe/runtime"
import { runToolCall } from "@vibe/tools"
import type { ToolRegistry } from "@vibe/tools"

import type { AgentEvent, AgentInput, AgentResult, RunOptions } from "./types"

export interface LoopConfig {
  provider: ModelProvider
  model: string
  system?: string
  effort?: Effort
  maxTokens?: number
  registry: ToolRegistry
  conversation: Conversation
}

const EMPTY_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 }

/**
 * The agent run loop, as an async generator. `run()` drains it; `stream()`
 * exposes it directly. Each model round-trip is retried on transient provider
 * errors; tool calls run in parallel and their results are appended as one user
 * message before the next iteration — the standard agentic loop.
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
  const policy = defaultRetryPolicy()

  conversation.append({ role: "user", content: text })

  let iterations = 0
  let usage = EMPTY_USAGE

  while (true) {
    token.throwIfCancelled()
    if (++iterations > maxIterations) {
      throw runtimeError(`Agent exceeded maxIterations (${maxIterations})`)
    }
    yield { type: "iteration", iteration: iterations }

    const request = buildRequest({
      model: config.model,
      conversation,
      system: config.system,
      tools: registry.toSchemas(),
      effort: config.effort,
      maxTokens: config.maxTokens,
    })

    const response: ModelResponse = await executeWithRetry(() => provider.generate(request), {
      policy,
      cancellationToken: token,
      timeoutMs: undefined,
      onAttempt: (attempt, error) =>
        options.logger?.warn("model:retry", { attempt, error: String(error) }),
    })

    usage = addUsage(usage, response.usage)
    conversation.append({ role: "assistant", content: response.content })

    for (const block of response.content) {
      if (block.type === "text") yield { type: "text", delta: block.text }
      else if (block.type === "thinking") yield { type: "thinking", delta: block.text }
    }

    if (response.stopReason !== "tool_use") {
      // end_turn | max_tokens | refusal | pause → the run is over.
      const result = finish(response, usage, iterations, conversation)
      yield { type: "done", result }
      return result
    }

    // tool_use: announce every call, run them in parallel, then feed results back.
    const calls = response.content.filter(isToolUse)
    for (const call of calls) {
      yield { type: "toolCall", id: call.id, name: call.name, input: call.input }
    }

    const executed = await Promise.all(
      calls.map(async (call) => {
        const tool = registry.get(call.name)
        const block = tool
          ? await runToolCall(
              tool,
              call.input,
              { cancellationToken: token, logger: options.logger },
              { timeoutMs: options.toolTimeoutMs },
            ).then((r) => toolResultBlock(call.id, r.content, r.isError ?? false))
          : toolResultBlock(call.id, `Unknown tool: "${call.name}"`, true)
        return { call, block }
      }),
    )

    for (const { call, block } of executed) {
      yield {
        type: "toolResult",
        id: call.id,
        name: call.name,
        content: block.content,
        isError: block.isError,
      }
    }

    conversation.append({ role: "user", content: executed.map((e) => e.block) })
  }
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
