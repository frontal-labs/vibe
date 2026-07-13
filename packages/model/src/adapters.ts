import { type AnthropicProviderOptions, createAnthropicProvider } from "./anthropic/provider"
import { createFakeProvider, type FakeTurn } from "./fake/provider"
import { createOpenAIProvider, type OpenAIProviderOptions } from "./openai/provider"
import type { ModelProvider } from "./types"

/**
 * Provider adapters — one function per provider, each returning a `ModelProvider`.
 * Select a provider by importing its adapter and passing the result as `provider`
 * (no magic string names):
 *
 * ```ts
 * import { openai, anthropic } from "@vibe/model"
 * createSystem({ provider: openai({ apiKey }) })  // or openai() to read OPENAI_API_KEY
 * createSystem({ provider: anthropic() })          // reads ANTHROPIC_API_KEY
 * ```
 */

/** The Anthropic provider (reads `ANTHROPIC_API_KEY` from env when `apiKey` is omitted). */
export function anthropic(options: AnthropicProviderOptions = {}): ModelProvider {
  return createAnthropicProvider(options)
}

/**
 * An OpenAI-compatible provider. Reads `OPENAI_API_KEY` / `OPENAI_BASE_URL` from env
 * when omitted; point `baseURL` at Azure/vLLM/Ollama/together for those backends.
 */
export function openai(options: OpenAIProviderOptions = {}): ModelProvider {
  return createOpenAIProvider(options)
}

/** A deterministic scripted provider for tests and offline runs. */
export function fake(script: FakeTurn[] = []): ModelProvider {
  return createFakeProvider(script)
}
