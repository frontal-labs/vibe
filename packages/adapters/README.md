# vibe/adapters

HTTP and protocol adapters that turn Vibe agents and tools into server handlers.

## What it does

Provides thin adapters to expose agents over different transports: a Fetch API
handler, a Node listener, an OpenAI-compatible chat completions endpoint, and an
SSE streaming helper. Use it to serve `AgentLike` runtimes from edge, Node, or
OpenAI-compatible frontends.

## Install

```sh
bun add vibe/adapters
```

## Usage

```ts
import { toFetchHandler, toOpenAICompatHandler, toSseStream } from "@vibe/adapters"

const handler = toFetchHandler({ agent })
const openaiHandler = toOpenAICompatHandler({ agent })
```
