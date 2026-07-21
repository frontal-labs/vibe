# vibe/ontology

Entity definitions, retrieval, and an in-memory ontology store.

## What it does

`defineEntity` declares typed entities/relations; `createEntityRegistry` tracks
them. `createInMemoryOntologyStore` and `createHashingEmbedder` provide storage
and embeddings. `retrieveContext` and `createRetrieveTool` enable
retrieval-augmented tooling.

## Install

```sh
bun add vibe/ontology
```

## Usage

```ts
import { defineEntity, createInMemoryOntologyStore, retrieveContext } from "vibe/ontology"

const User = defineEntity("User", { fields: { name: "string" } })
const store = createInMemoryOntologyStore()
const hits = await retrieveContext(store, "find users")
```
