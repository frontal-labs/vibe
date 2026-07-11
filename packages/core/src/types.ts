import type { LogLevel } from "@vibe/logger"
import type { Effort, ModelProvider } from "@vibe/model"
import type { Plugin } from "@vibe/plugin"
import type { Tool } from "@vibe/tools"

export interface SystemConfig {
  name: string
  logLevel?: LogLevel
  plugins?: Plugin[]
  /** The model provider backing `ask()` / the default agent. */
  provider?: ModelProvider
  /** Default model id for the system's agent (defaults to `claude-opus-4-8`). */
  model?: string
  /** Default system prompt for the system's agent. */
  system?: string
  /** Default reasoning effort. */
  effort?: Effort
  /** Tools available to the default agent. */
  tools?: Tool[]
}

export interface SystemInfo {
  name: string
  version: string
  state: string
  uptimeMs: number
  pluginCount: number
}
