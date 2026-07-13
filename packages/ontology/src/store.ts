/** A stored record: structured data plus the text used for semantic retrieval. */
export interface OntologyRecord {
  readonly id: string
  readonly entity: string
  readonly data: Record<string, unknown>
  readonly text: string
}

export interface OntologyRecordInput {
  readonly id: string
  readonly entity: string
  readonly data: Record<string, unknown>
  /** Text to index for retrieval; defaults to the JSON of `data`. */
  readonly text?: string
}

/** A directed, labeled edge between two records (the relation graph). */
export interface Relation {
  readonly from: string
  readonly rel: string
  readonly to: string
}

export interface RetrievedRecord {
  readonly record: OntologyRecord
  readonly score: number
}

export interface RetrieveOptions {
  readonly limit?: number
  /** Restrict retrieval to records of one entity type. */
  readonly entity?: string
}

/** Turns text into a vector. Swap the default for a real embedding model. */
export type Embedder = (text: string) => number[]

/**
 * The semantic layer: upsert records, relate them, and retrieve grounding context
 * by similarity. In-memory + a deterministic hashing embedder ships as the
 * reference implementation; the interface lets enterprises swap in pgvector, a
 * graph DB, or a hosted embedding model without touching callers.
 */
export interface OntologyStore {
  upsert(record: OntologyRecordInput): Promise<void>
  relate(from: string, rel: string, to: string): Promise<void>
  related(id: string, rel?: string): Promise<OntologyRecord[]>
  retrieve(query: string, options?: RetrieveOptions): Promise<RetrievedRecord[]>
  get(id: string): Promise<OntologyRecord | undefined>
}

const DEFAULT_DIMENSIONS = 256

/** A dependency-free bag-of-words hashing embedder (a stand-in for a real model). */
export function createHashingEmbedder(dimensions = DEFAULT_DIMENSIONS): Embedder {
  return (text: string) => {
    const vec = new Array<number>(dimensions).fill(0)
    for (const token of text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)) {
      let hash = 2_166_136_261
      for (let i = 0; i < token.length; i++) {
        hash ^= token.charCodeAt(i)
        hash = Math.imul(hash, 16_777_619)
      }
      const slot = Math.abs(hash) % dimensions
      vec[slot] = (vec[slot] ?? 0) + 1
    }
    return vec
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0
    const bi = b[i] ?? 0
    dot += ai * bi
    na += ai * ai
    nb += bi * bi
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export interface OntologyStoreOptions {
  embed?: Embedder
  dimensions?: number
}

export function createInMemoryOntologyStore(options: OntologyStoreOptions = {}): OntologyStore {
  const embed = options.embed ?? createHashingEmbedder(options.dimensions)
  const records = new Map<string, OntologyRecord>()
  const vectors = new Map<string, number[]>()
  const relations: Relation[] = []

  return {
    upsert: (input) => {
      const text = input.text ?? JSON.stringify(input.data)
      const record: OntologyRecord = {
        id: input.id,
        entity: input.entity,
        data: input.data,
        text,
      }
      records.set(input.id, record)
      vectors.set(input.id, embed(text))
      return Promise.resolve()
    },

    relate: (from, rel, to) => {
      relations.push({ from, rel, to })
      return Promise.resolve()
    },

    related: (id, rel) => {
      const out: OntologyRecord[] = []
      for (const edge of relations) {
        if (edge.from === id && (rel === undefined || edge.rel === rel)) {
          const record = records.get(edge.to)
          if (record) out.push(record)
        }
      }
      return Promise.resolve(out)
    },

    retrieve: (query, opts = {}) => {
      const queryVec = embed(query)
      const scored: RetrievedRecord[] = []
      for (const [id, record] of records) {
        if (opts.entity && record.entity !== opts.entity) continue
        const vec = vectors.get(id)
        if (vec) scored.push({ record, score: cosine(queryVec, vec) })
      }
      scored.sort((a, b) => b.score - a.score)
      return Promise.resolve(scored.slice(0, opts.limit ?? 5))
    },

    get: (id) => Promise.resolve(records.get(id)),
  }
}
