import { createRequire } from "node:module"

/**
 * The optional Rust addon (`vibe_napi`) surface. Every method is optional: the addon may be
 * absent, or an older build may not export a newer function. Callers must always keep a pure-TS
 * fallback — the framework works without the addon; it is strictly a performance accelerator.
 *
 * napi-derive converts the Rust `snake_case` exports to `camelCase` here (`tool_edges` →
 * `toolEdges`, `count_messages` → `countMessages`, …).
 */
export interface NativeAddon {
  /** `vibe_bundler`: agent→tool import edges as a JSON string. */
  toolEdges?: (source: string, marker: string) => string
  /** `vibe_tokenizer`: token count of a string for a model family. */
  countText?: (text: string, family: string) => number
  /** `vibe_tokenizer`: per-message token counts for a JSON message array. */
  countMessages?: (messagesJson: string, family: string) => number[]
  /** `vibe_sse`: fold a full OpenAI SSE body to `{ events, response }` JSON. */
  sseFold?: (body: string) => string
  /** Addon version. */
  version?: () => string
}

let checked = false
let addon: NativeAddon | null = null

/** A `require` that works in both the ESM and CJS builds. */
function resolveRequire(): (id: string) => unknown {
  // `import.meta.url` is undefined in the CJS build — fall back to the cwd.
  const base = typeof import.meta.url === "string" ? import.meta.url : `${process.cwd()}/`
  return createRequire(base)
}

/**
 * Load the Rust native addon if `VIBE_NATIVE_ADDON` points at it, memoizing the result (including
 * the "not present" case). Returns `null` when the env var is unset or the module fails to load,
 * so callers fall through to their TS implementation.
 */
export function nativeAddon(): NativeAddon | null {
  if (!checked) {
    checked = true
    const path = process.env.VIBE_NATIVE_ADDON
    if (path) {
      try {
        addon = resolveRequire()(path) as NativeAddon
      } catch {
        addon = null
      }
    }
  }
  return addon
}

/** Reset the memoized addon. Test-only — lets a suite toggle `VIBE_NATIVE_ADDON` between cases. */
export function resetNativeAddonCache(): void {
  checked = false
  addon = null
}
