import type { StandardSchemaV1 } from "@standard-schema/spec"
import { toJsonSchema } from "vibe/tools"

/** The outcome of validating a record against an entity's schema. */
export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly { readonly message: string }[] }

/**
 * A versioned domain entity: a canonical, typed data contract shared across tools,
 * skills, and workflow steps. The Standard Schema is the single source of truth —
 * it validates records at runtime and yields the model-facing JSON Schema.
 */
export interface Entity<
  Name extends string = string,
  Schema extends StandardSchemaV1 = StandardSchemaV1,
> {
  readonly name: Name
  readonly version: number
  readonly schema: Schema
  readonly jsonSchema: Record<string, unknown>
  validate(input: unknown): Promise<ValidationResult<StandardSchemaV1.InferOutput<Schema>>>
}

/** An entity with its schema erased — the element type of a heterogeneous list. */
export interface AnyEntity extends Entity<string, StandardSchemaV1> {}

export interface EntityOptions {
  /** Schema version (default 1). The registry keeps every version addressable. */
  version?: number
}

export function defineEntity<const Name extends string, Schema extends StandardSchemaV1>(
  name: Name,
  schema: Schema,
  options: EntityOptions = {},
): Entity<Name, Schema> {
  return {
    name,
    version: options.version ?? 1,
    schema,
    jsonSchema: toJsonSchema(schema),
    async validate(input) {
      const result = await schema["~standard"].validate(input)
      if (result.issues) {
        return { ok: false, issues: result.issues.map((i) => ({ message: i.message })) }
      }
      return { ok: true, value: result.value as StandardSchemaV1.InferOutput<Schema> }
    },
  }
}
