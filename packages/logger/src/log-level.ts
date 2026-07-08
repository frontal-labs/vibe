export enum LogLevel {
  Trace = 0,
  Debug = 10,
  Info = 20,
  Warn = 30,
  Error = 40,
  Fatal = 50,
}

export function logLevelFromString(level: string): LogLevel {
  const normalized = level.toLowerCase()
  switch (normalized) {
    case "trace":
      return LogLevel.Trace
    case "debug":
      return LogLevel.Debug
    case "info":
      return LogLevel.Info
    case "warn":
    case "warning":
      return LogLevel.Warn
    case "error":
      return LogLevel.Error
    case "fatal":
      return LogLevel.Fatal
    default: {
      return LogLevel.Info
    }
  }
}

export function logLevelToString(level: LogLevel): string {
  switch (level) {
    case LogLevel.Trace:
      return "trace"
    case LogLevel.Debug:
      return "debug"
    case LogLevel.Info:
      return "info"
    case LogLevel.Warn:
      return "warn"
    case LogLevel.Error:
      return "error"
    case LogLevel.Fatal:
      return "fatal"
  }
}
