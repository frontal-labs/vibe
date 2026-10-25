import type { LifecycleEvent } from "vibe/lifecycle"

export type HookName = string

export type HookHandler = (...args: unknown[]) => void | Promise<void>

/**
 * Payload shapes for hooks that carry a checked type. A package that emits a typed hook adds its
 * name here by declaration merging, so handlers registered with `on(name, …)` receive the payload
 * typed rather than `unknown`:
 *
 * ```ts
 * declare module "vibe/plugin" {
 *   interface HookPayloadMap { "billing:charged": { amountCents: number } }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: intentionally open; packages augment it
export interface HookPayloadMap {}

/** Hook names that have a declared payload type. */
export type TypedHookName = keyof HookPayloadMap & string

/** A handler for a typed hook, receiving that hook's payload. */
export type TypedHookHandler<K extends TypedHookName> = (
  payload: HookPayloadMap[K],
) => void | Promise<void>

export interface PluginHooks {
  on<K extends TypedHookName>(name: K, handler: TypedHookHandler<K>): void
  on(name: HookName, handler: HookHandler): void
  onBefore<K extends LifecycleEvent>(name: K, handler: HookHandler): void
  onAfter<K extends LifecycleEvent>(name: K, handler: HookHandler): void
}

export interface PluginManifest {
  name: string
  version: string
  description: string
  dependencies?: string[]
}

export interface Plugin {
  readonly name: string
  readonly version: string
  readonly manifest: PluginManifest
  setup(hooks: PluginHooks): void | Promise<void>
}
