# vibe/devtools

Developer utilities for inspecting and costing agent runs.

## What it does

Estimates token/cost spend with `estimateCost` and `MODEL_PRICING`, prints
agent events with `createEventPrinter`, and formats transcripts, usage, and
results via `formatTranscript`, `formatUsage`, and `summarizeResult`.

## Install

```sh
bun add vibe/devtools
```

## Usage

```ts
import { estimateCost, formatUsage, summarizeResult } from "vibe/devtools"

const cost = estimateCost(result)
console.log(formatUsage(result.usage))
```
