import type { ServiceToken } from "./token"

export type ServiceScope = "singleton" | "scoped" | "transient"

export type Factory<T> = (container: Container) => T

export interface Registration<T = unknown> {
  factory: Factory<T>
  scope: ServiceScope
}

export interface Container {
  register<T>(token: ServiceToken<T>, factory: Factory<T>, scope?: ServiceScope): void
  registerInstance<T>(token: ServiceToken<T>, instance: T): void
  resolve<T>(token: ServiceToken<T>): T
  isRegistered<T>(token: ServiceToken<T>): boolean
  createScope(): Container
  dispose(): void
}
