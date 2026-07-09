import { ContextStore } from "@vibe/shared"

export interface LogContext {
  correlationId?: string
  [key: string]: unknown
}

export const logContextStore = new ContextStore<LogContext>()

export function getCorrelationId(): string | undefined {
  return logContextStore.get()?.correlationId
}

export function runWithLogContext<R>(context: LogContext, fn: () => R | Promise<R>): Promise<R> {
  return logContextStore.run(context, fn)
}
