import { defineConfig } from "vibe/config"

// The typed shape of a Vibe app. `agents/` and `tools/` are auto-discovered by
// convention (each file default-exports one), so there's nothing else to wire.
export default defineConfig({
  name: "support-app",
  provider: "anthropic",
  model: "claude-opus-4-8",
})
