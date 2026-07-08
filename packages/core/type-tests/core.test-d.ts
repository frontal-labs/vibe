import { expectType, expectError } from "tsd"

import { vibe } from "../src/vibe"
import type { SystemConfig, SystemInfo } from "../src/types"
import type { System } from "../src/system"

const system = vibe.system({ name: "test" })
expectType<System>(system)
expectType<string>(system.name)
expectType<SystemInfo>(system.info)
expectType<string>(system.info.state)
expectType<number>(system.info.pluginCount)
expectType<Promise<string>>(system.ask("hello"))

// Invalid config should be caught
expectError(vibe.system({}))
expectError(vibe.system({ name: 123 }))
