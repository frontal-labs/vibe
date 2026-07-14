import { timeoutError } from "@vibe/errors"

import type { ResourceHandle, ResourceManager } from "./types"

export function createResourceManager(): ResourceManager {
  const pools = new Map<
    string,
    {
      active: number
      max: number
      queue: Array<{
        resolve: (handle: ResourceHandle) => void
        timeout?: ReturnType<typeof setTimeout>
      }>
    }
  >()

  function getPool(name: string, limit: number) {
    let pool = pools.get(name)
    if (!pool) {
      pool = { active: 0, max: limit, queue: [] }
      pools.set(name, pool)
    }
    pool.max = limit
    return pool
  }

  function processQueue(pool: {
    active: number
    max: number
    queue: Array<{
      resolve: (handle: ResourceHandle) => void
      timeout?: ReturnType<typeof setTimeout>
    }>
  }) {
    while (pool.active < pool.max && pool.queue.length > 0) {
      const entry = pool.queue.shift()
      if (entry) {
        if (entry.timeout) {
          clearTimeout(entry.timeout)
        }
        pool.active++
        entry.resolve({
          release: () => {
            pool.active--
            processQueue(pool)
          },
        })
      }
    }
  }

  // biome-ignore lint/suspicious/useAwait: complex return type (Promise | direct object)
  async function acquire(
    name: string,
    limit: number,
    options?: { timeoutMs?: number },
  ): Promise<ResourceHandle> {
    const pool = getPool(name, limit)

    if (pool.active < pool.max) {
      pool.active++
      return {
        release: () => {
          pool.active--
          processQueue(pool)
        },
      }
    }

    return new Promise<ResourceHandle>((resolve, reject) => {
      const entry: {
        resolve: (handle: ResourceHandle) => void
        timeout?: ReturnType<typeof setTimeout>
      } = {
        resolve,
      }

      if (options?.timeoutMs) {
        const timeoutValue = options.timeoutMs
        entry.timeout = setTimeout(() => {
          const idx = pool.queue.indexOf(entry)
          if (idx >= 0) {
            pool.queue.splice(idx, 1)
          }
          reject(
            timeoutError(
              `Resource "${name}" acquisition timed out after ${timeoutValue}ms`,
              timeoutValue,
            ),
          )
        }, timeoutValue)
      }

      pool.queue.push(entry)
    })
  }

  function getUsage(name: string): { active: number; max: number; pending: number } {
    const pool = pools.get(name)
    if (!pool) {
      return { active: 0, max: 0, pending: 0 }
    }
    return {
      active: pool.active,
      max: pool.max,
      pending: pool.queue.length,
    }
  }

  return {
    acquire,
    getUsage,
  }
}
