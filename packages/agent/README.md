# vibe/agent

Core agent runtime: build agents, run tool-calling loops, and delegate to sub-agents.

## What it does

`createAgent` wires up an agent from a config, `runLoop` drives the
tool-calling/observation loop, and `createDelegateTool` lets one agent hand work
to another. Includes an event drain and hook system (`AGENT_HOOKS`, `hookFor`)
for observing runs.

## Install

```sh
bun add vibe/agent
```

## Usage

```ts
import { createAgent, runLoop } from "vibe/agent"

const agent = createAgent({ model, tools })
const result = await runLoop({ agent, input: "Summarize this." })
```
