# vibe/config

Load, define, and merge Vibe application configuration.

## What it does

Locates and loads a project's `vibe.config` (`findConfig`, `loadConfig`,
`isVibeApp`), lets you author configs with `defineConfig`, and merges
overrides with `mergeConfig`. The `VibeConfig` type covers build, security,
observability, ontology, and governance settings.

## Install

```sh
bun add vibe/config
```

## Usage

```ts
import { loadConfig, defineConfig, mergeConfig } from "@vibe/config"

const config = await loadConfig("./app")
const merged = mergeConfig(config, { observability: { enabled: true } })
```
