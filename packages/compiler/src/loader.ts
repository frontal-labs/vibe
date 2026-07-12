import { createRequire } from "node:module"

import { runtimeError } from "@vibe/errors"

import type { CompilerBinding } from "./types"

/**
 * Load the native Vibe compiler addon (napi). Resolution order:
 *   1. `$VIBE_NATIVE_ADDON` — an explicit path to a `.node`/dylib.
 *   2. `@vibe/compiler-native` — the published prebuilt package (per-platform).
 * Throws an actionable error if none is found — build it with
 * `cargo build -p vibe_napi --features node --release`.
 */
export function loadNativeBinding(): CompilerBinding {
  const require = createRequire(import.meta.url)
  const candidates = [process.env.VIBE_NATIVE_ADDON, "@vibe/compiler-native"].filter(
    (c): c is string => typeof c === "string" && c.length > 0,
  )

  for (const candidate of candidates) {
    try {
      const mod = require(candidate) as Partial<CompilerBinding>
      if (mod && typeof mod.compile === "function") {
        return mod as CompilerBinding
      }
    } catch {
      // try the next candidate
    }
  }

  throw runtimeError(
    "Vibe native compiler addon not found. Build it with `cargo build -p vibe_napi --features node --release` and point VIBE_NATIVE_ADDON at the resulting .node file (or install @vibe/compiler-native).",
  )
}
