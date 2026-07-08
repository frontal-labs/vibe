import { AsyncLocalStorage } from "node:async_hooks"

import type { Awaitable } from "./types"

export class ContextStore<T> {
  private readonly storage = new AsyncLocalStorage<T>()

  run<R>(value: T, fn: () => Awaitable<R>): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      this.storage.run(value, async () => {
        try {
          resolve(await fn())
        } catch (error) {
          reject(error)
        }
      })
    })
  }

  get(): T | undefined {
    return this.storage.getStore()
  }

  getOrThrow(message?: string): T {
    const value = this.storage.getStore()
    if (value === undefined) {
      throw new TypeError(message ?? "Context store is empty")
    }
    return value
  }

  has(): boolean {
    return this.storage.getStore() !== undefined
  }

  disable(): void {
    this.storage.disable()
  }

  enterWith(value: T): void {
    this.storage.enterWith(value)
  }
}
