import type { LifecycleEvent } from "@vibe/lifecycle"

import type { HookHandler, HookName, PluginHooks } from "./types"

interface HandlerEntry {
  handler: HookHandler
  priority: number
}

export function createPluginHooks(): PluginHooks & {
  execute(name: HookName, ...args: unknown[]): Promise<void>
  executeBefore(event: LifecycleEvent): Promise<void>
  executeAfter(event: LifecycleEvent): Promise<void>
} {
  const handlers = new Map<HookName, HandlerEntry[]>()
  const beforeHandlers = new Map<LifecycleEvent, HookHandler[]>()
  const afterHandlers = new Map<LifecycleEvent, HookHandler[]>()

  function on(name: HookName, handler: HookHandler): void {
    let entries = handlers.get(name)
    if (!entries) {
      entries = []
      handlers.set(name, entries)
    }
    entries.push({ handler, priority: 0 })
  }

  function onBefore(event: LifecycleEvent, handler: HookHandler): void {
    let entries = beforeHandlers.get(event)
    if (!entries) {
      entries = []
      beforeHandlers.set(event, entries)
    }
    entries.push(handler)
  }

  function onAfter(event: LifecycleEvent, handler: HookHandler): void {
    let entries = afterHandlers.get(event)
    if (!entries) {
      entries = []
      afterHandlers.set(event, entries)
    }
    entries.push(handler)
  }

  async function execute(name: HookName, ...args: unknown[]): Promise<void> {
    const entries = handlers.get(name)
    if (!entries) return
    for (const entry of entries) {
      await entry.handler(...args)
    }
  }

  async function executeBefore(event: LifecycleEvent): Promise<void> {
    const entries = beforeHandlers.get(event)
    if (!entries) return
    for (const handler of entries) {
      await handler()
    }
  }

  async function executeAfter(event: LifecycleEvent): Promise<void> {
    const entries = afterHandlers.get(event)
    if (!entries) return
    for (const handler of entries) {
      await handler()
    }
  }

  return { on, onBefore, onAfter, execute, executeBefore, executeAfter }
}
