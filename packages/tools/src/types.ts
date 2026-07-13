import type { StandardSchemaV1 } from "@standard-schema/spec"
import type { Logger } from "@vibe/logger"
import type { ToolSchema } from "@vibe/model"
import type { CancellationToken } from "@vibe/runtime"

/** Ambient services handed to a tool handler for the duration of one call. */
export interface ToolContext {
  /** Cooperative cancellation for the whole agent run. */
  readonly cancellationToken?: CancellationToken
  /** A DOM-style signal, for handlers that call `fetch`/other abortable APIs. */
  readonly signal?: AbortSignal
  /** A logger already scoped to the run's trace id. */
  readonly logger?: Logger
  /**
   * A secrets source for the handler (injected by the security layer). Structural
   * so `@vibe/tools` needn't depend on `@vibe/security`; `SecretsProvider` satisfies it.
   */
  readonly secrets?: { get(name: string): Promise<string | undefined> }
}

/** The normalized outcome of a tool call, as fed back to the model. */
export interface ToolResult {
  readonly content: string
  /** When true, `content` is an error message the model should react to. */
  readonly isError?: boolean
}

/** What a handler may return: a bare string (success) or an explicit result. */
export type ToolReturn = string | ToolResult

/**
 * A handler typed by a Standard Schema. `input` is inferred from the schema's
 * output type — Zod, Valibot, ArkType, or any Standard-Schema validator — so tool
 * bodies are typesafe by default with zero casts.
 */
export type ToolHandler<Schema extends StandardSchemaV1> = (
  input: StandardSchemaV1.InferOutput<Schema>,
  ctx: ToolContext,
) => ToolReturn | Promise<ToolReturn>

/**
 * A registered tool. Generic over its literal `Name` and `Schema` so a tool set
 * can be tracked at the type level (typed tool-name/input narrowing in the agent
 * loop). Both params default, so bare `Tool` and `Tool[]` still work everywhere.
 */
export interface Tool<
  Name extends string = string,
  Schema extends StandardSchemaV1 = StandardSchemaV1,
> {
  readonly name: Name
  readonly description: string
  readonly schema: Schema
  /** JSON Schema derived from `schema` — this is what the model sees. */
  readonly inputSchema: Record<string, unknown>
  readonly execute: ToolHandler<Schema>
}

/**
 * A tool with its schema erased — the element type of a heterogeneous tool array.
 * Its `execute` accepts `any` so a `Tool<Name, Schema>` (whose handler input is
 * contravariant) is assignable to it; runtime validation still enforces the real
 * shape. Use `AnyTool[]` wherever tools of different schemas are stored together.
 */
export interface AnyTool {
  readonly name: string
  readonly description: string
  readonly schema: StandardSchemaV1
  readonly inputSchema: Record<string, unknown>
  // biome-ignore lint/suspicious/noExplicitAny: erased handler so tools with any input type share one array
  readonly execute: (input: any, ctx: ToolContext) => ToolReturn | Promise<ToolReturn>
}

/** The output type a tool's handler receives (its validated input). */
export type ToolInput<T extends Tool> = StandardSchemaV1.InferOutput<T["schema"]>

export type { ToolSchema }
