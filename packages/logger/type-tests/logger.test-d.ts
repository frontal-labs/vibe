import { expectType } from "tsd"

import {
  createConsoleTransport,
  createLogger,
  type Logger,
  LogLevel,
  logLevelFromString,
  logLevelToString,
  type Transport,
} from "../src/index"

const logger = createLogger({ level: LogLevel.Info, defaultMeta: { service: "api" } })
expectType<Logger>(logger)
expectType<void>(logger.info("started", { port: 3000 }))
expectType<Transport>(createConsoleTransport())
expectType<LogLevel>(logLevelFromString("debug"))
expectType<string>(logLevelToString(LogLevel.Warn))
