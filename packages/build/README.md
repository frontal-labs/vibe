# vibe/build

Discover, analyze, and bundle Vibe apps into deployable artifacts.

## What it does

Discovers an app's entry points, builds a dependency graph of its tools/agents
(`toolEdges`), plans and bundles an app (`bundleApp`, `createDevBuilder`), and
emits a `BuildManifest` via `toManifest`.

## Install

```sh
bun add vibe/build
```

## Usage

```ts
import { discoverApp, planBuild, bundleApp } from "vibe/build"

const app = discoverApp("./app")
const plan = planBuild(app)
const bundle = await bundleApp(plan)
```
