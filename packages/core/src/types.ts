import type { LogLevel } from "@vibe/logger"
import type { Plugin } from "@vibe/plugin"

export interface SystemConfig {
  name: string
  logLevel?: LogLevel
  plugins?: Plugin[]
}

export interface SystemInfo {
  name: string
  version: string
  state: string
  uptimeMs: number
  pluginCount: number
}
