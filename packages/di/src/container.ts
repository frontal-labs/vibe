import { diCircularDependency, diResolutionFailed } from "@vibe/errors"

import type { ServiceToken } from "./token"
import type { Container, Factory, Registration, ServiceScope } from "./types"

export function createContainer(parent?: Container): Container {
  const registrations = new Map<string, Registration>()
  const singletons = new Map<string, unknown>()
  const resolving = new Set<string>()
  const scopeInstances = new Map<string, unknown>()

  function getTokenKey<T>(token: ServiceToken<T>): string {
    return token as unknown as string
  }

  function getRegistration<T>(key: string): Registration<T> | undefined {
    return registrations.get(key) as Registration<T> | undefined
  }

  function register<T>(
    token: ServiceToken<T>,
    factory: Factory<T>,
    scope: ServiceScope = "singleton",
  ): void {
    const key = getTokenKey(token)
    if (registrations.has(key)) {
      throw diResolutionFailed(`Token "${key}" is already registered`)
    }
    registrations.set(key, { factory: factory as Factory<unknown>, scope })
  }

  function registerInstance<T>(token: ServiceToken<T>, instance: T): void {
    const key = getTokenKey(token)
    if (registrations.has(key)) {
      throw diResolutionFailed(`Token "${key}" is already registered`)
    }
    registrations.set(key, {
      factory: () => instance,
      scope: "singleton",
    })
    singletons.set(key, instance)
  }

  function resolve<T>(token: ServiceToken<T>): T {
    const key = getTokenKey(token)

    if (resolving.has(key)) {
      throw diCircularDependency(`Circular dependency detected for token "${key}"`)
    }

    const registration = getRegistration<T>(key)

    if (!registration) {
      if (parent) {
        return parent.resolve(token)
      }
      throw diResolutionFailed(`No registration found for token "${key}"`)
    }

    const scope = registration.scope

    if (scope === "singleton") {
      if (singletons.has(key)) {
        return singletons.get(key) as T
      }
      resolving.add(key)
      try {
        const instance = registration.factory(container)
        singletons.set(key, instance)
        return instance
      } finally {
        resolving.delete(key)
      }
    }

    if (scope === "scoped") {
      if (scopeInstances.has(key)) {
        return scopeInstances.get(key) as T
      }
      resolving.add(key)
      try {
        const instance = registration.factory(container)
        scopeInstances.set(key, instance)
        return instance
      } finally {
        resolving.delete(key)
      }
    }

    resolving.add(key)
    try {
      return registration.factory(container)
    } finally {
      resolving.delete(key)
    }
  }

  function isRegistered<T>(token: ServiceToken<T>): boolean {
    const key = getTokenKey(token)
    return registrations.has(key)
  }

  function createScope(): Container {
    return createContainer(container)
  }

  function dispose(): void {
    singletons.clear()
    registrations.clear()
    resolving.clear()
    scopeInstances.clear()
  }

  const container: Container = {
    register,
    registerInstance,
    resolve,
    isRegistered,
    createScope,
    dispose,
  }

  return container
}
