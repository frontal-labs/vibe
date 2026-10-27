# vibe/lifecycle

Lifecycle state machine for Vibe systems and services.

## What it does

`createLifecycle` manages startup/shutdown sequencing with observable
`LifecycleState`s (`LIFECYCLE_STATES`) and handlers. Handlers can react to
`LifecycleEvent`s and transition services through well-defined states.

## Install

```sh
bun add vibe/lifecycle
```

## Usage

```ts
import { createLifecycle, LIFECYCLE_STATES } from "@vibe/lifecycle"

const lifecycle = createLifecycle()
lifecycle.on(LIFECYCLE_STATES.starting, () => startDb())
await lifecycle.start()
```
