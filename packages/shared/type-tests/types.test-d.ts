import { expectAssignable, expectError, expectType } from "tsd"

import type { Awaitable, Fn, Maybe, Nullish, Result } from "../src/types"

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
const maybeValue = (): Maybe<string> => "hello"
expectAssignable<string | undefined>(maybeValue())

// Awaitable
const syncVal = (): Awaitable<number> => 42
expectAssignable<number | Promise<number>>(syncVal())

const asyncVal = (): Awaitable<number> => Promise.resolve(42)
expectAssignable<number | Promise<number>>(asyncVal())

// Fn
const voidFn: Fn = () => {}
expectAssignable<void | Promise<void>>(voidFn())

const typedFn: Fn<[string, number], boolean> = (_s: string, _n: number) => true
expectType<boolean | Promise<boolean>>(typedFn("", 0))
expectError(typedFn(""))
expectError(typedFn("", 0, true))

// Nullish
const nullVal = (): Nullish => null
expectAssignable<null | undefined>(nullVal())
const undefVal = (): Nullish => undefined
expectAssignable<null | undefined>(undefVal())
expectError<Nullish>(false)
