import { expectType } from "tsd"

import {
  createEntityRegistry,
  createHashingEmbedder,
  createInMemoryOntologyStore,
  type Embedder,
  type EntityRegistry,
  type OntologyStore,
} from "../src/index"

const embedder = createHashingEmbedder()
expectType<Embedder>(embedder)

const store = createInMemoryOntologyStore()
expectType<OntologyStore>(store)

expectType<EntityRegistry>(createEntityRegistry([]))
