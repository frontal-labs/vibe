import { expectType } from "tsd"
import type { VibeConfig } from "../src/index"
import { defineConfig } from "../src/index"

const c = defineConfig({ name: "app", provider: "anthropic", model: "claude-opus-4-8" })
expectType<VibeConfig>(c)
// model autocompletes catalog ids but accepts custom
defineConfig({ name: "x", model: "some-custom-model" })
