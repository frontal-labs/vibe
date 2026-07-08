import { expectType, expectNotType, expectError } from "tsd"

import type { Brand } from "../src/brand"

type SystemId = Brand<string, "SystemId">
type SessionId = Brand<string, "SessionId">

// Brand types should not be assignable to each other
expectError<SystemId>("" as SessionId)

// Brand types should be assignable to their base type
const id: SystemId = "" as SystemId
expectType<string>(id)

// Base type should not be assignable to brand type
expectError<SystemId>("plain-string")

// Brand type should preserve its identity through union operations
type OptionalSystemId = SystemId | undefined
const maybeId: OptionalSystemId = undefined
expectType<SystemId | undefined>(maybeId)
