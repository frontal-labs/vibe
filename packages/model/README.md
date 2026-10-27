# vibe/model

Model provider abstraction with Anthropic and OpenAI adapters.

## What it does

Normalizes model calls across providers: `createAnthropicProvider` and
`createOpenAIProvider` (plus a `createFakeProvider` for tests), a model
catalog (`KNOWN_MODEL_IDS`, `priceUsd`, `contextWindowFor`), request/response
mappers, and streaming helpers (`createOpenAIStreamAccumulator`).

## Install

```sh
bun add vibe/model
```

## Usage

```ts
import { createOpenAIProvider, MODEL_CATALOG, priceUsd } from "@vibe/model"

const provider = createOpenAIProvider({ apiKey })
const res = await provider.complete({ model: "gpt-4o", messages })
```
