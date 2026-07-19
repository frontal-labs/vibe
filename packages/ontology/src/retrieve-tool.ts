import { defineTool, type Tool } from "vibe/tools"
import { z } from "zod"

import type { OntologyStore, RetrieveOptions } from "./store"

/** Format retrieved records as compact grounding context for a prompt/tool result. */
export async function retrieveContext(
  store: OntologyStore,
  query: string,
  options?: RetrieveOptions,
): Promise<string> {
  const hits = await store.retrieve(query, options)
  if (hits.length === 0) return "No matching records."
  return hits
    .map(
      (h) => `- (${h.record.entity} ${h.record.id}, score ${h.score.toFixed(2)}) ${h.record.text}`,
    )
    .join("\n")
}

const retrieveSchema = z.object({
  query: z.string().describe("What to look up in the ontology"),
  limit: z.number().int().positive().max(20).optional().describe("Max records to return"),
  entity: z.string().optional().describe("Restrict to a single entity type"),
})

/**
 * A tool that lets an agent query the {@link OntologyStore} for grounding context
 * mid-loop — the retrieval side of the ontology, exposed to the model as a tool.
 */
export function createRetrieveTool(
  store: OntologyStore,
  toolName = "ontology_retrieve",
): Tool<string, typeof retrieveSchema> {
  return defineTool({
    name: toolName,
    description: "Retrieve grounding records from the ontology by semantic similarity.",
    schema: retrieveSchema,
    execute: ({ query, limit, entity }) => retrieveContext(store, query, { limit, entity }),
  })
}
