import type { LifecycleEvent } from "@vibe/lifecycle"

export type HookName = string

export type HookHandler = (...args: unknown[]) => void | Promise<void>

export interface PluginHooks {
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
