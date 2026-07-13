import type { StandardSchemaV1 } from "@standard-schema/spec"
import { describe, expect, it } from "vitest"

import { defineTool } from "../src/define-tool"
import { runToolCall } from "../src/execute"
import { toJsonSchema } from "../src/to-json-schema"

/**
 * A hand-rolled Standard Schema (vendor !== "zod") proving the framework is
 * validator-agnostic — the same contract Valibot/ArkType implement.
 */
function upper(): StandardSchemaV1<unknown, { value: string }> {
  return {
    "~standard": {
      version: 1,
      vendor: "custom",
      validate(input) {
        if (
          typeof input !== "object" ||
          input === null ||
          typeof (input as { value?: unknown }).value !== "string"
        ) {
          return { issues: [{ message: "value must be a string" }] }
        }
        return { value: { value: (input as { value: string }).value.toUpperCase() } }
      },
    },
  }
}

describe("Standard Schema interop", () => {
  it("accepts a non-Zod validator and infers/validates via ~standard", async () => {
    const tool = defineTool({
      name: "shout",
      description: "uppercases",
      schema: upper(),
      execute: (input) => `shouted: ${input.value}`, // input.value typed as string
    })
    const ok = await runToolCall(tool, { value: "hi" })
    expect(ok).toEqual({ content: "shouted: HI" })
  })

  it("returns isError for invalid input from a custom validator", async () => {
    const tool = defineTool({
      name: "shout",
      description: "uppercases",
      schema: upper(),
      execute: (input) => input.value,
    })
    const bad = await runToolCall(tool, { value: 123 })
    expect(bad.isError).toBe(true)
    expect(bad.content).toContain("value must be a string")
  })

  it("falls back to a permissive JSON schema for non-Zod validators", () => {
    expect(toJsonSchema(upper())).toEqual({ type: "object", additionalProperties: true })
  })

  it("captures the literal tool name in the type/value", () => {
    const tool = defineTool({
      name: "exact_name",
      description: "d",
      schema: upper(),
      execute: () => "x",
    })
    expect(tool.name).toBe("exact_name")
  })
})
