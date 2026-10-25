import { expectAssignable } from "tsd"

import type { Brand } from "../src/brand"

type SystemId = Brand<string, "SystemId">
type SessionId = Brand<string, "SessionId">

// Brand types should not be assignable to each other
// @ts-expect-error: must not compile
;((_value: SystemId) => undefined)("" as SessionId)

// Brand types should be assignable to their base type
const id: SystemId = "" as SystemId
expectAssignable<string>(id)

// Base type should not be assignable to brand type
// @ts-expect-error: must not compile
;((_value: SystemId) => undefined)("plain-string")

// Brand type should preserve its identity through union operations
type OptionalSystemId = SystemId | undefined
const maybeId: OptionalSystemId = undefined
expectAssignable<SystemId | undefined>(maybeId)
