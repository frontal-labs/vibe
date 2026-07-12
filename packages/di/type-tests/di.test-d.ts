import { expectError, expectType } from "tsd"
import type { ServiceToken } from "../src/token"
import { createToken } from "../src/token"
import type { Container } from "../src/types"

// ServiceToken should carry the correct type
const stringToken = createToken<string>("str")
expectType<ServiceToken<string>>(stringToken)

// Container resolve should return the correct type
const container = null as unknown as Container
expectType<string>(container.resolve(stringToken))

// Token type mismatch should be caught at compile time
expectError<ServiceToken<number>>(stringToken)
