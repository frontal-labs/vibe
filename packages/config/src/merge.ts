import type { VibeConfig } from "./types"

/** Merge config layers left-to-right (later wins); arrays/records shallow-merge. */
export function mergeConfig(...layers: Array<Partial<VibeConfig>>): Partial<VibeConfig> {
  const out: Record<string, unknown> = {}
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined) {
        continue
      }
      if (Array.isArray(value) && Array.isArray(out[key])) {
        out[key] = [...(out[key] as unknown[]), ...value]
      } else if (isPlainObject(value) && isPlainObject(out[key])) {
        out[key] = { ...(out[key] as object), ...value }
      } else {
        out[key] = value
      }
    }
  }
  return out as Partial<VibeConfig>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
