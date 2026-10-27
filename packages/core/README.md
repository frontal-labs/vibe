# vibe/core

Top-level system composition for Vibe apps.

## What it does

Assembles a `System` of services (logger, memory, plugin host, tool registry,
lifecycle, enterprise) via `createSystem`, exposes DI tokens
(`containerToken`, `loggerToken`, etc.), and provides the convenience `vibe`
entrypoint for bootstrapping an app.

## Install

```sh
bun add vibe/core
```

## Usage

```ts
import { vibe, createSystem } from "@vibe/core"

const system = createSystem({ config })
const app = vibe({ config })
```
