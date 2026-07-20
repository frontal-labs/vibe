# @frontal-labs/vibe

## 0.1.0

### Minor Changes

- d006045: Rename the umbrella barrel package `vibe` → `@frontal-labs/vibe`.

  Consumers now install and import from `@frontal-labs/vibe` (subpaths unchanged, e.g.
  `import { createAgent } from "@frontal-labs/vibe/agent"`). The internal `vibe/*` scope, the `vibe`
  CLI command, the `vibe.config.*` filename, the `VIBE_NATIVE_ADDON` env var, and the Rust crate
  names are all unchanged — this is purely the published barrel package name.

### Patch Changes

- Updated dependencies [2464d04]
  - vibe/memory@0.1.0
  - vibe/model@0.1.0
  - vibe/agent@0.1.0
  - vibe/config@0.1.0
  - vibe/errors@0.1.0
  - vibe/adapters@0.0.1
  - vibe/core@0.0.1
  - vibe/deploy@0.0.1
  - vibe/devtools@0.0.1
  - vibe/di@0.0.1
  - vibe/evals@0.0.1
  - vibe/logger@0.0.1
  - vibe/plugin@0.0.1
  - vibe/runtime@0.0.1
  - vibe/tools@0.0.1
  - vibe/tracing@0.0.1
  - vibe/workflows@0.0.1
  - vibe/observability@0.0.1
  - vibe/governance@0.0.1
  - vibe/ontology@0.0.1
  - vibe/security@0.0.1
  - vibe/skills@0.0.1
