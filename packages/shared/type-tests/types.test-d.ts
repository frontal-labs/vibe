import { expectType, expectError } from "tsd"

import type { Result, Maybe, Awaitable, Fn, Nullish } from "../src/types"

// Result
const okResult: Result<number> = { ok: true, value: 42 }
expectType<number>(okResult.value)

const errResult: Result<number> = { ok: false, error: new Error("fail") }
expectType<Error>(errResult.error)

// Result with custom error type
type ApiResult = Result<string, { code: number }>
const apiErr: ApiResult = { ok: false, error: { code: 404 } }
expectType<{ code: number }>(apiErr.error)

// Maybe
const maybe: Maybe<string> = "hello"
expectType<string | undefined>(maybe)

// Awaitable
const sync: Awaitable<number> = 42
expectType<number | Promise<number>>(sync)

const async_: Awaitable<number> = Promise.resolve(42)
expectType<number | Promise<number>>(async_)

// Fn
const voidFn: Fn = () => {}
expectType<void>(voidFn())

const typedFn: Fn<[string, number], boolean> = (_s: string, _n: number) => true
expectType<boolean | Promise<boolean>>(typedFn("", 0))
expectError(typedFn(""))
expectError(typedFn("", 0, true))

// Nullish
const n: Nullish = null
expectType<null | undefined>(n)
const u: Nullish = undefined
expectType<null | undefined>(u)
expectError<Nullish>(false)
