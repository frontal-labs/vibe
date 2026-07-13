import type { VibeConfig } from "./types"

/**
 * Identity helper that types a `vibe.config.ts` export. Gives autocomplete and
 * type-checking without changing the value:
 *
 * ```ts
 * export default defineConfig({ name: "app", provider: "anthropic" })
 * ```
 */
export function defineConfig(config: VibeConfig): VibeConfig {
  return config
}
