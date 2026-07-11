import type { Logger } from "@vibe/logger"
import type { ToolSchema } from "@vibe/model"
import type { CancellationToken } from "@vibe/runtime"
import type { z } from "zod"

/** Ambient services handed to a tool handler for the duration of one call. */
export interface ToolContext {
  /** Cooperative cancellation for the whole agent run. */
  readonly cancellationToken?: CancellationToken
  /** A DOM-style signal, for handlers that call `fetch`/other abortable APIs. */
  readonly signal?: AbortSignal
  /** A logger already scoped to the run's trace id. */
  readonly logger?: Logger
}

/** The normalized outcome of a tool call, as fed back to the model. */
export interface ToolResult {
  readonly content: string
  /** When true, `content` is an error message the model should react to. */
  readonly isError?: boolean
}

/** What a handler may return: a bare string (success) or an explicit result. */
export type ToolReturn = string | ToolResult

/** A Zod-schema-typed handler. */
export type ToolHandler<Schema extends z.ZodType> = (
  input: z.infer<Schema>,
  ctx: ToolContext,
) => ToolReturn | Promise<ToolReturn>

/** A registered tool: a Zod schema, its model-facing JSON Schema, and a handler. */
export interface Tool<Schema extends z.ZodType = z.ZodType> {
  readonly name: string
  readonly description: string
  readonly schema: Schema
  /** JSON Schema derived from `schema` — this is what the model sees. */
  readonly inputSchema: Record<string, unknown>
  readonly execute: ToolHandler<Schema>
}

export type { ToolSchema }
