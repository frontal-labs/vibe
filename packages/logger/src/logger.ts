import { LogLevel } from "./log-level"
import { getCorrelationId } from "./context"
import { createConsoleTransport } from "./transports/console"
import type { Logger, LoggerOptions, LogMeta, LogEntry, Transport } from "./types"

export function createLogger(options?: LoggerOptions): Logger {
  const level = options?.level ?? LogLevel.Info
  const transports: Transport[] =
    options?.transports?.length ? options.transports : [createConsoleTransport()]
  const defaultMeta: LogMeta = options?.defaultMeta ?? {}

  function shouldLog(entryLevel: LogLevel): boolean {
    return entryLevel >= level
  }

  function log(entryLevel: LogLevel, message: string, meta?: LogMeta): void {
    if (!shouldLog(entryLevel)) {
      return
    }

    const correlationId = getCorrelationId()
    const entry: LogEntry = {
      level: entryLevel,
      message,
      meta: { ...defaultMeta, ...meta },
      timestamp: new Date().toISOString(),
      correlationId,
    }

    for (const transport of transports) {
      transport.log(entry)
    }
  }

  const logger: Logger = {
    trace(message: string, meta?: LogMeta) {
      log(LogLevel.Trace, message, meta)
    },
    debug(message: string, meta?: LogMeta) {
      log(LogLevel.Debug, message, meta)
    },
    info(message: string, meta?: LogMeta) {
      log(LogLevel.Info, message, meta)
    },
    warn(message: string, meta?: LogMeta) {
      log(LogLevel.Warn, message, meta)
    },
    error(message: string, meta?: LogMeta) {
      log(LogLevel.Error, message, meta)
    },
    fatal(message: string, meta?: LogMeta) {
      log(LogLevel.Fatal, message, meta)
    },
    child(meta: LogMeta): Logger {
      return createLogger({
        level,
        transports,
        defaultMeta: { ...defaultMeta, ...meta },
      })
    },
  }

  return logger
}
