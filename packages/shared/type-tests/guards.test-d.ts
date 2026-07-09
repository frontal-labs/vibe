import { expectType } from "tsd"

import { assertDefined } from "../src/guards"

// assertDefined should narrow types
function testAssertDefined(value: string | null): string {
  assertDefined(value)
  return value
}

expectType<string>(testAssertDefined("hello"))
