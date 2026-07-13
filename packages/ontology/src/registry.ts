import type { AnyEntity } from "./entity"

/**
 * A versioned registry of domain entities. Each `name@version` is addressable;
 * `get(name)` without a version returns the highest registered version — the
 * canonical contract layer tools/skills/workflows resolve their I/O types against.
 */
export interface EntityRegistry {
  register(entity: AnyEntity): void
  get(name: string, version?: number): AnyEntity | undefined
  versions(name: string): number[]
  list(): AnyEntity[]
  /** JSON Schemas of the latest version of each entity, keyed by name. */
  toJSONSchema(): Record<string, Record<string, unknown>>
}

function key(name: string, version: number): string {
  return `${name}@${version}`
}

export function createEntityRegistry(initial: readonly AnyEntity[] = []): EntityRegistry {
  const entities = new Map<string, AnyEntity>()

  function register(entity: AnyEntity): void {
    const k = key(entity.name, entity.version)
    if (entities.has(k)) {
      throw new Error(`Entity "${entity.name}" v${entity.version} is already registered`)
    }
    entities.set(k, entity)
  }

  function versions(name: string): number[] {
    return [...entities.values()]
      .filter((e) => e.name === name)
      .map((e) => e.version)
      .sort((a, b) => a - b)
  }

  function get(name: string, version?: number): AnyEntity | undefined {
    if (version !== undefined) return entities.get(key(name, version))
    const latest = versions(name).at(-1)
    return latest === undefined ? undefined : entities.get(key(name, latest))
  }

  for (const entity of initial) register(entity)

  return {
    register,
    get,
    versions,
    list: () => [...entities.values()],
    toJSONSchema: () => {
      const names = new Set([...entities.values()].map((e) => e.name))
      const out: Record<string, Record<string, unknown>> = {}
      for (const name of names) {
        const entity = get(name)
        if (entity) out[name] = entity.jsonSchema
      }
      return out
    },
  }
}
