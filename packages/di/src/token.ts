import type { Brand } from "@vibe/shared"

export type ServiceToken<T> = Brand<string, `ServiceToken`> & {
  readonly __type: T
}

let counter = 0

export function createToken<T>(name: string): ServiceToken<T> {
  counter++
  return `${name}__${counter}` as ServiceToken<T>
}
