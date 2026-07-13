import { createAgent } from "vibe/agent"
import { createAnthropicProvider } from "vibe/model"
import { createInMemoryOntologyStore, createRetrieveTool, retrieveContext } from "vibe/ontology"

// A semantic store: records indexed for similarity retrieval. The default embedder
// is a dependency-free hashing embedder; swap in pgvector or a hosted model in prod.
const store = createInMemoryOntologyStore()
await store.upsert({
  id: "p-1",
  entity: "policy",
  data: { topic: "returns" },
  text: "Returns are accepted within 30 days with a receipt.",
})
await store.upsert({
  id: "p-2",
  entity: "policy",
  data: { topic: "shipping" },
  text: "Standard shipping takes 3 to 5 business days.",
})
await store.upsert({
  id: "p-3",
  entity: "policy",
  data: { topic: "warranty" },
  text: "Electronics carry a 1-year limited warranty.",
})

// Direct retrieval — the grounding context that RAG would inject into a prompt:
const grounding = await retrieveContext(store, "returns accepted with a receipt", { limit: 2 })
console.log(`retrieved:\n${grounding}`)

// Or give the agent a retrieve tool so it grounds answers mid-loop, on demand.
const retrieve = createRetrieveTool(store)
const agent = createAgent({
  provider: createAnthropicProvider(),
  system: "Answer only from retrieved policy records. If nothing matches, say so.",
  tools: [retrieve],
})
console.log("\nanswer:", (await agent.run("What's the return window?")).text)
