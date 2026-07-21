# vibe/plugin

Plugin host and hook system for extending Vibe apps.

## What it does

`createPluginHost` loads and manages `Plugin`s, dispatches lifecycle and
extension `HookName`s through `createPluginHooks`, and exposes `PluginManifest`
metadata. Lets packages contribute tools, agents, and behavior at runtime.

## Install

```sh
bun add vibe/plugin
```

## Usage

```ts
import { createPluginHost } from "vibe/plugin"

const host = createPluginHost()
host.register({ name: "my-plugin", hooks: { onStart: () => {} } })
await host.start()
```
