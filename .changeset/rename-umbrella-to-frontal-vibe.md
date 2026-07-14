---
"frontal-vibe": minor
---

Rename the umbrella barrel package `vibe` → `frontal-vibe`.

Consumers now install and import from `frontal-vibe` (subpaths unchanged, e.g.
`import { createAgent } from "frontal-vibe/agent"`). The internal `@vibe/*` scope, the `vibe`
CLI command, the `vibe.config.*` filename, the `VIBE_NATIVE_ADDON` env var, and the Rust crate
names are all unchanged — this is purely the published barrel package name.
