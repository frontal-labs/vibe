# vibe/logger

Structured, context-aware logging with pluggable transports.

## What it does

`createLogger` emits leveled, structured logs; `createConsoleTransport`
outputs to the console. `runWithLogContext` and `logContextStore` attach
per-request context. Levels are parsed/serialized with `LogLevel`,
`logLevelFromString`, and `logLevelToString`.

## Install

```sh
bun add vibe/logger
```

## Usage

```ts
import { createLogger, createConsoleTransport, runWithLogContext } from "vibe/logger"

const logger = createLogger({ transports: [createConsoleTransport()] })
runWithLogContext({ requestId: "1" }, () => logger.info("started"))
```
