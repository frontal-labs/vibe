import type { LogLevel } from "./log-level"

export interface LogMeta {
  readonly [key: string]: unknown
}

export interface LogEntry {
  readonly level: LogLevel
  readonly message: string
  readonly meta: LogMeta
  readonly timestamp: string
  readonly correlationId: string | undefined
}

export interface Logger {
  trace(message: string, meta?: LogMeta): void
  debug(message: string, meta?: LogMeta): void
  info(message: string, meta?: LogMeta): void
  warn(message: string, meta?: LogMeta): void
  error(message: string, meta?: LogMeta): void
  fatal(message: string, meta?: LogMeta): void
  child(meta: LogMeta): Logger
}

export interface Transport {
  log(entry: LogEntry): void
}

export interface LoggerOptions {
  level?: LogLevel
  transports?: Transport[]
  defaultMeta?: LogMeta
}
