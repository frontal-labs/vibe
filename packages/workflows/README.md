# vibe/workflows

Define, compose, and execute durable workflows.

## What it does

`defineWorkflow` declares a workflow; `step`, `parallel`, `mapOver`, and
`conditional` compose steps; `runWorkflow`/`executeWorkflow` execute them.
`createMemoryCheckpointStore` provides durable checkpoints across runs.

## Install

```sh
bun add vibe/workflows
```

## Usage

```ts
import { defineWorkflow, step, runWorkflow, createMemoryCheckpointStore } from "vibe/workflows"

const wf = defineWorkflow({ name: "pipeline", steps: [step("fetch", fetchData)] })
const store = createMemoryCheckpointStore()
const result = await runWorkflow(wf, { input }, { checkpointStore: store })
```
