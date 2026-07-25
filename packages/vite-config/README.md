# @vibe/vite-config

Shared Vite configuration for building all `vibe` workspace packages.

## Install

```bash
bun add -D @vibe/vite-config
```

## Usage

```ts
// vite.config.ts
import { defineConfig } from "vite"
import { createBaseConfig } from "vibe/vite-config"

export default defineConfig(createBaseConfig("src/index.ts"))
```

## What it provides

- **Library mode** — emits both ESM (`.js`) and CJS (`.cjs`) bundles into `dist/`
- **Node 20 target** — `build.target: "node20"`
- **Sourcemaps** — enabled for all builds
- **Workspace aliases** — auto-resolves `vibe/<name>` imports to each package's `src/` directory via `resolve.alias`, so cross-package development requires no pre-build of dependencies
- **Externalization** — marks as external:
  - Node built-ins (`node:*`, `fs`, `path`, etc.)
  - All `vibe/*` workspace packages
  - Common third-party deps (`zod`, `@anthropic-ai/sdk`, `esbuild`, `handlebars`, `chokidar`, `commander`, `@standard-schema/spec`)

## API

### `createBaseConfig(entry?: string): UserConfig`

Returns a Vite `UserConfig` object. Accepts an optional entry point (defaults to `"src/index.ts"`).

## Scripts

| Script | Description |
|--------|-------------|
| `build` | `vite build && tsc --emitDeclarationOnly` |
| `dev` | `vite build --watch` |
| `test` | `vitest run` |
| `typecheck` | `tsc --noEmit` |
| `clean` | `rm -rf dist` |

## Dependencies

Zero runtime dependencies. Only devDependencies on `vite`, `vitest`, and `tsd`.
