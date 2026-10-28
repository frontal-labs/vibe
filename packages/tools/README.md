# vibe/tools

Define, register, and execute tools with JSON-schema generation.

## What it does

`defineTool` declares typed tools, `createToolRegistry` manages them,
`runToolCall` executes tool calls, and `toJsonSchema` converts tool schemas to
JSON Schema for model consumption. Defines `Tool`, `ToolHandler`, and
`ToolContext` types.

## Install

```sh
bun add vibe/tools
```

## Usage

```ts
import { defineTool, createToolRegistry, runToolCall } from "@vibe/tools"

const getWeather = defineTool({ name: "getWeather", input: { city: "string" }, handler: async ({ city }) => `sunny in ${city}` })
const registry = createToolRegistry([getWeather])
const result = await runToolCall(registry, { tool: "getWeather", input: { city: "Lisbon" } })
```
