export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }

export type Maybe<T> = T | undefined

export type Awaitable<T> = T | Promise<T>

export type Fn<A extends readonly unknown[] = readonly [], R = void> = (...args: A) => Awaitable<R>

export type Nullish = null | undefined
