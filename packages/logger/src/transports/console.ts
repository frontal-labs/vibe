import { logLevelToString } from "../log-level"
import type { LogEntry, Transport } from "../types"

export interface ConsoleTransportOptions {
  colorize?: boolean
}

export function createConsoleTransport(
  options?: ConsoleTransportOptions,
): Transport {
  return {
    log(entry: LogEntry) {
      const level = logLevelToString(entry.level)
      const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`
      const correlation = entry.correlationId
        ? ` [correlation: ${entry.correlationId}]`
        : ""
      const metaStr =
        Object.keys(entry.meta).length > 0
          ? ` ${JSON.stringify(entry.meta)}`
          : ""

      const formatted = `${prefix}${correlation} ${entry.message}${metaStr}`

      switch (entry.level) {
        case 0: // Trace
        case 10: // Debug
          console.debug(formatted)
          break
        case 20: // Info
          console.info(formatted)
          break
        case 30: // Warn
          console.warn(formatted)
          break
        case 40: // Error
        case 50: // Fatal
          console.error(formatted)
          break
      }
    },
  }
}
