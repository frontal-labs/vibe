# vibe/memory

Conversation memory and request building for agents.

## What it does

`createConversation` and `createInMemoryMemory` store message history;
`buildRequest` assembles model requests with configurable compaction
(`estimateTokens`, `CompactionStrategy`). Defines `Conversation`, `Memory`, and
`Message` types.

## Install

```sh
bun add vibe/memory
```

## Usage

```ts
import { createConversation, buildRequest } from "@vibe/memory"

const convo = createConversation()
convo.add("user", "hello")
const req = buildRequest(convo, { model, tools })
```
