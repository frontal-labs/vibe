import type { StandardSchemaV1 } from "@standard-schema/spec"
import { z } from "zod"

/**
 * Derive the model-facing JSON Schema from any Standard Schema validator.
 *
 * - **Zod** (the default): use `z.toJSONSchema` (Draft 2020-12).
 * - **ArkType** and friends that expose `.toJsonSchema()`: use it.
 * - **Anything else**: fall back to a permissive object schema. Runtime input is
 *   still validated by the schema's `~standard.validate`, so correctness holds —
 *   only the shape advertised to the model is less precise.
 */
export function toJsonSchema(schema: StandardSchemaV1): Record<string, unknown> {
  if (schema["~standard"].vendor === "zod") {
    return z.toJSONSchema(schema as unknown as z.ZodType, {
      target: "draft-2020-12",
    }) as Record<string, unknown>
  }

  const maybe = schema as { toJsonSchema?: () => Record<string, unknown> }
  if (typeof maybe.toJsonSchema === "function") {
    return maybe.toJsonSchema()
  }

  return { type: "object", additionalProperties: true }
}
