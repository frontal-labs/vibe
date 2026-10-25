import { expectType } from "tsd"
import type { UserConfig } from "vite"

import { createBaseConfig } from "../src/index"

expectType<UserConfig>(createBaseConfig())
expectType<UserConfig>(createBaseConfig("src/main.ts"))
